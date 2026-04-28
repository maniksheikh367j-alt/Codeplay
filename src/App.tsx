import { useState, useEffect, useRef, FormEvent } from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import { 
  Terminal, Play, Trash2, Code, ShieldCheck, ShieldAlert, Cpu, Maximize2, Minimize2, 
  Settings, LogIn, LayoutDashboard, Image as ImageIcon, Sparkles, Languages, Save, X, Eye, EyeOff, LogOut,
  Wand2, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const DEFAULT_HTML = `<div class="container">
  <h1>Hello, World!</h1>
  <p>Start coding below to see real-time changes.</p>
  <button id="btn">Click Me!</button>
</div>`;

const DEFAULT_CSS = `body {
  background: #0f172a;
  color: white;
  font-family: sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  margin: 0;
}

.container {
  text-align: center;
  padding: 2rem;
  background: #1e293b;
  border-radius: 1rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
}

button {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  cursor: pointer;
  margin-top: 1rem;
  transition: transform 0.1s;
}

button:active {
  transform: scale(0.95);
}`;

const DEFAULT_JS = `document.getElementById('btn').addEventListener('click', () => {
  alert('Live Preview is working! 🚀');
});`;

const STORAGE_KEYS = {
  HTML: 'codeplay_html_v1',
  CSS: 'codeplay_css_v1',
  JS: 'codeplay_js_v1',
};

type EditorTab = 'html' | 'css' | 'js';
type AppView = 'editor' | 'admin_login' | 'admin_dashboard';
type ThemeType = 'dark' | 'neon' | 'premium';
type LanguageType = 'bn' | 'en' | 'hi' | 'ur';

interface AppSettings {
  appName: string;
  appDescription: string;
  theme: ThemeType;
  language: LanguageType;
  aiConfig: {
    model: string;
    systemPrompt: string;
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  appName: "CodePlay",
  appDescription: "Real-time Editor",
  theme: 'dark',
  language: 'en',
  aiConfig: {
    model: "gemini-1.5-flash",
    systemPrompt: "You are a helpful coding assistant."
  }
};

const TRANSLATIONS = {
  en: { editor: 'Editor', dashboard: 'Dashboard', login: 'Login', logout: 'Logout', save: 'Save Changes', clear: 'Clear Code', run: 'Run Code' },
  bn: { editor: 'এডিটর', dashboard: 'ড্যাশবোর্ড', login: 'লগইন', logout: 'লগআউট', save: 'পরিবর্তন সংরক্ষণ করুন', clear: 'কোড মুছুন', run: 'রান করুন' },
  hi: { editor: 'संपादक', dashboard: 'डैशबोर्ड', login: 'लॉगিন', logout: 'লগআউট', save: 'परिवर्तन सहेजें', clear: 'कोड साफ़ करें', run: 'कोड चलाएं' },
  ur: { editor: 'ایڈیٹر', dashboard: 'ڈیش بورڈ', login: 'لاگ ان', logout: 'لاگ آؤٹ', save: 'تبدیلیاں محفوظ کریں', clear: 'کوڈ صاف کریں', run: 'رن کریں' }
};

const THEMES = {
  dark: "bg-neutral-950 text-neutral-200 border-neutral-800",
  neon: "bg-black text-cyan-400 border-fuchsia-500",
  premium: "bg-slate-900 text-amber-100 border-amber-900"
};

export default function App() {
  // App State
  const [html, setHtml] = useState(() => localStorage.getItem(STORAGE_KEYS.HTML) ?? DEFAULT_HTML);
  const [css, setCss] = useState(() => localStorage.getItem(STORAGE_KEYS.CSS) ?? DEFAULT_CSS);
  const [js, setJs] = useState(() => localStorage.getItem(STORAGE_KEYS.JS) ?? DEFAULT_JS);
  const [activeTab, setActiveTab] = useState<EditorTab>('html');
  const [isPreviewFull, setIsPreviewFull] = useState(false);
  const [status, setStatus] = useState<'success' | 'error' | 'idle'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Admin & Settings State
  const [view, setView] = useState<AppView>('editor');
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // AI State
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  // Firebase Init
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u && view === 'admin_login') setView('admin_dashboard');
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as AppSettings);
      }
    });

    return () => {
      unsubAuth();
      unsubSettings();
    };
  }, []);

  // Set initial admin metadata if missing
  useEffect(() => {
    if (user && user.email === 'maniksheikh2006@gmail.com') {
      const adminDoc = doc(db, 'admins', user.uid);
      getDoc(adminDoc).then((snap) => {
        if (!snap.exists()) {
          setDoc(adminDoc, { uid: user.uid, email: user.email, role: 'admin' });
        }
      });
    }
  }, [user]);

  // Auto-save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.HTML, html);
    localStorage.setItem(STORAGE_KEYS.CSS, css);
    localStorage.setItem(STORAGE_KEYS.JS, js);
  }, [html, css, js]);

  const handleAutoFill = () => {
    setLoginForm({ email: 'maniksheikh2006@gmail.com', password: 'Manik@&*3' });
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, loginForm.email, loginForm.password);
      setView('admin_dashboard');
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed') {
        setLoginError("Error (auth/operation-not-allowed): আপনার Firebase Console-এ গিয়ে Authentication > Sign-in method-এ গিয়ে Email/Password চালু (Enable) করতে হবে। এটি ছাড়া লগইন সম্ভব নয়।");
      } else if (err.code === 'auth/user-not-found' && loginForm.email === 'maniksheikh2006@gmail.com') {
        try {
          await createUserWithEmailAndPassword(auth, loginForm.email, loginForm.password);
          setView('admin_dashboard');
        } catch (createErr: any) {
          setLoginError("Create Error: " + createErr.message);
        }
      } else if (err.code === 'auth/wrong-password') {
        setLoginError("ভুল পাসওয়ার্ড! আবার চেষ্টা করুন।");
      } else {
        setLoginError("লগইন এরর: " + err.message);
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView('editor');
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'global'), {
        ...settings,
        updatedAt: serverTimestamp()
      });
      alert('Settings saved successfully!');
    } catch (err: any) {
      alert('Error saving settings: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate only raw ${activeTab.toUpperCase()} code for the following request: ${aiPrompt}. 
        Do not include markdown code blocks, explanations, or any other text. Only provide the executable code.`,
      });
      
      const generatedCode = response.text || '';
      // Simple sanitization to remove markdown if model ignores instructions
      const cleanCode = generatedCode.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();

      if (activeTab === 'html') setHtml(cleanCode);
      else if (activeTab === 'css') setCss(cleanCode);
      else if (activeTab === 'js') setJs(cleanCode);
      
      setShowAiModal(false);
      setAiPrompt('');
    } catch (err: any) {
      alert("AI Generation Error: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const updatePreview = () => {
    if (!iframeRef.current) return;

    const combinedCode = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>${css}</style>
        </head>
        <body>
          ${html}
          <script>
            window.onerror = function(msg, url, lineNo, columnNo, error) {
              window.parent.postMessage({ type: 'error', message: msg + ' (Line: ' + lineNo + ')' }, '*');
              return false;
            };
            try {
              ${js}
              window.parent.postMessage({ type: 'success' }, '*');
            } catch (err) {
              window.parent.postMessage({ type: 'error', message: err.message }, '*');
            }
          </script>
        </body>
      </html>
    `;

    iframeRef.current.srcdoc = combinedCode;
  };

  useEffect(() => {
    const timeout = setTimeout(updatePreview, 500);
    return () => clearTimeout(timeout);
  }, [html, css, js]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'error') {
        setStatus('error');
        setErrorMessage(event.data.message);
      } else if (event.data.type === 'success') {
        setStatus('success');
        setErrorMessage('');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const clearCode = () => {
    setHtml('');
    setCss('');
    setJs('');
    setStatus('idle');
  };

  const t = TRANSLATIONS[settings.language] || TRANSLATIONS.en;
  const tc = THEMES[settings.theme] || THEMES.dark;

  if (view === 'admin_login') {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${tc}`}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-600/20">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">Admin Login</h2>
            <p className="text-neutral-400 text-sm mt-2">Secure access restricted to administrators.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:border-blue-500 outline-none transition-all"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:border-blue-500 outline-none transition-all pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {loginError && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] rounded-lg text-center"
              >
                {loginError}
                {loginError.includes('operation-not-allowed') && (
                  <a 
                    href="https://console.firebase.google.com/" 
                    target="_blank" 
                    rel="noreferrer"
                    className="block mt-2 text-white underline font-bold"
                  >
                    Open Firebase Console to Enable Email/Password
                  </a>
                )}
              </motion.div>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleAutoFill}
                className="w-full py-2 bg-neutral-800/50 hover:bg-neutral-800 text-neutral-400 text-[10px] font-bold uppercase tracking-widest rounded-lg border border-white/5 transition-all"
              >
                Auto-fill Manik's Credentials
              </button>
              
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setView('editor')}
                  className="flex-1 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[2] px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <LogIn className="w-5 h-5" />
                  Sign In
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  if (view === 'admin_dashboard') {
    return (
      <div className={`min-h-screen flex flex-col ${tc}`}>
        <header className="px-6 py-4 border-b border-white/10 bg-black/40 backdrop-blur-md flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView('editor')}
              className="text-neutral-400 hover:text-white text-sm font-medium flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              View Site
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-rose-600/10 text-rose-400 hover:bg-rose-600/20 border border-rose-600/20 rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* General Config */}
            <section className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-6">
              <div className="flex items-center gap-3 text-blue-400 mb-2">
                <Settings className="w-5 h-5" />
                <h2 className="font-bold text-lg">General Settings</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">App Name</label>
                  <input
                    type="text"
                    value={settings.appName}
                    onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">App Description</label>
                  <textarea
                    value={settings.appDescription}
                    onChange={(e) => setSettings({ ...settings, appDescription: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none h-24"
                  />
                </div>
              </div>
            </section>

            {/* Visuals & UX */}
            <section className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-6">
              <div className="flex items-center gap-3 text-fuchsia-400 mb-2">
                <Sparkles className="w-5 h-5" />
                <h2 className="font-bold text-lg">User Experience</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">Theme</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['dark', 'neon', 'premium'] as ThemeType[]).map(t => (
                      <button
                        key={t}
                        onClick={() => setSettings({ ...settings, theme: t })}
                        className={`py-2 rounded-lg border text-sm font-medium transition-all ${
                          settings.theme === t 
                            ? 'bg-blue-600/20 border-blue-600 text-blue-400' 
                            : 'bg-black/20 border-white/5 text-neutral-500 hover:border-white/20'
                        }`}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">Language</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(['bn', 'en', 'hi', 'ur'] as LanguageType[]).map(l => (
                      <button
                        key={l}
                        onClick={() => setSettings({ ...settings, language: l })}
                        className={`py-2 rounded-lg border text-sm font-medium transition-all ${
                          settings.language === l 
                            ? 'bg-blue-600/20 border-blue-600 text-blue-400' 
                            : 'bg-black/20 border-white/5 text-neutral-500 hover:border-white/20'
                        }`}
                      >
                        {l.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* AI Agent Config */}
            <section className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-6">
              <div className="flex items-center gap-3 text-emerald-400 mb-2">
                <Cpu className="w-5 h-5" />
                <h2 className="font-bold text-lg">AI Agent Control</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">Gemini Model</label>
                  <select
                    value={settings.aiConfig.model}
                    onChange={(e) => setSettings({ ...settings, aiConfig: { ...settings.aiConfig, model: e.target.value } })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none appearance-none"
                  >
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Assets */}
            <section className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-6">
              <div className="flex items-center gap-3 text-amber-400 mb-2">
                <ImageIcon className="w-5 h-5" />
                <h2 className="font-bold text-lg">Media Library</h2>
              </div>
              <div className="p-12 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center text-center">
                <ImageIcon className="w-10 h-10 text-neutral-600 mb-4" />
                <p className="text-neutral-500 text-sm">Drag images here to upload metadata</p>
                <button className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs rounded-lg transition-all">
                  Browse Files
                </button>
              </div>
            </section>
          </div>

          <div className="flex justify-end pt-8">
            <button
              onClick={saveSettings}
              disabled={isSaving}
              className="flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-xl shadow-emerald-900/20 transition-all disabled:opacity-50"
            >
              {isSaving ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save className="w-6 h-6" />}
              {t.save}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${tc}`}>
      {/* Header */}
      <header className="px-6 py-4 border-b border-inherit bg-black/40 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/40">
            <Cpu className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white leading-none">
              {settings.appName}
            </h1>
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest mt-1">
              {settings.appDescription}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <AnimatePresence mode="wait">
            {status !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm ${
                  status === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-600 text-white'
                }`}
              >
                {status === 'success' ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>SUCCESS ✅</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span className="max-w-[120px] sm:max-w-[200px] truncate">ERROR ❌</span>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => setShowAiModal(true)}
            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2 mr-2"
            title="Generate with AI"
          >
            <Wand2 className="w-5 h-5" />
            <span className="hidden lg:inline text-xs font-bold uppercase tracking-wider">AI Gen</span>
          </button>
          
          <button
            onClick={clearCode}
            className="p-2 text-neutral-400 hover:text-rose-400 hover:bg-white/5 rounded-lg transition-colors"
            title={t.clear}
          >
            <Trash2 className="w-5 h-5" />
          </button>
          
          <button
            onClick={updatePreview}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 shadow-lg shadow-blue-600/20"
          >
            <Play className="w-4 h-4 fill-current" />
            <span className="hidden sm:inline">{t.run}</span>
          </button>

          <button
            onClick={() => setView(user ? 'admin_dashboard' : 'admin_login')}
            className="p-2 text-neutral-600 hover:text-blue-400 hover:bg-white/5 rounded-lg transition-colors ml-2"
            title="Admin Login"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row h-[calc(100vh-73px)] overflow-hidden">
        {/* Preview Section */}
        <section 
          className={`transition-all duration-300 ease-in-out bg-white relative overflow-hidden flex flex-col
            ${isPreviewFull ? 'fixed inset-0 z-[60] h-screen w-screen' : 'flex-1 min-h-[45vh] md:min-h-0 border-b md:border-b-0 md:border-r border-inherit'}
          `}
        >
          {/* Preview Header / Controls */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
            <div className="flex items-center gap-2 px-2 py-1 bg-neutral-100/90 border border-neutral-200 rounded text-[10px] font-mono text-neutral-600 uppercase font-bold shadow-sm backdrop-blur-sm pointer-events-none">
              <Terminal className="w-3 h-3" />
              Live Output
            </div>
            
            <button
              onClick={() => setIsPreviewFull(!isPreviewFull)}
              className="p-1.5 bg-black/10 hover:bg-black/20 text-neutral-600 rounded-md transition-colors backdrop-blur-sm shadow-sm"
              title={isPreviewFull ? "Exit Full Screen" : "Full Screen Preview"}
            >
              {isPreviewFull ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {status !== 'idle' && (
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold shadow-sm backdrop-blur-sm ${
                status === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-600 text-white'
              }`}>
                {status === 'success' ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                <span>{status === 'success' ? 'LIVE' : 'ERROR'}</span>
              </div>
            )}
          </div>

          <iframe
            ref={iframeRef}
            title="Preview"
            className="flex-1 w-full border-none bg-white display-block"
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
          />
        </section>

        {/* Editor Section */}
        <section className={`flex-1 flex flex-col bg-black/20 overflow-hidden ${isPreviewFull ? 'hidden' : 'flex'}`}>
          {/* Tabs */}
          <div className="flex border-b border-inherit px-2 bg-black/40 overflow-x-auto no-scrollbar">
            {(['html', 'css', 'js'] as EditorTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium transition-all relative flex-shrink-0 ${
                  activeTab === tab ? 'text-blue-400' : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2 uppercase tracking-widest text-[10px]">
                  <Code className="w-3 h-3" />
                  {tab}
                </div>
                {activeTab === tab && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                  />
                )}
              </button>
            ))}
          </div>

          {/* Code Area */}
          <div className="flex-1 overflow-auto relative bg-neutral-950/20 touch-auto">
            <div className="p-4 min-h-full font-mono">
              <Editor
                value={activeTab === 'html' ? html : activeTab === 'css' ? css : js}
                onValueChange={(code) => {
                  if (activeTab === 'html') setHtml(code);
                  else if (activeTab === 'css') setCss(code);
                  else setJs(code);
                }}
                highlight={(code) =>
                  highlight(
                    code,
                    activeTab === 'html' ? languages.markup : activeTab === 'css' ? languages.css : languages.javascript,
                    activeTab
                  )
                }
                padding={20}
                className="prism-editor-wrapper text-inherit"
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 16,
                  minHeight: '100%',
                  lineHeight: '1.6',
                }}
              />
            </div>
          </div>
        </section>
      </main>

      {/* AI Modal */}
      <AnimatePresence>
        {showAiModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600/20 rounded-lg">
                    <Wand2 className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white uppercase tracking-tight">AI Code Architect</h3>
                    <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">Generating {activeTab.toUpperCase()}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAiModal(false)}
                  className="p-2 text-neutral-500 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-neutral-400">Describe what you want to build in <span className="text-blue-400 font-bold uppercase">{activeTab}</span>:</p>
                <textarea
                  autoFocus
                  placeholder={
                    activeTab === 'html' ? "e.g. A modern dark-themed landing page hero section..." :
                    activeTab === 'css' ? "e.g. Neon glowing button styles with hover animations..." :
                    "e.g. A function that calculates Fibonacci numbers..."
                  }
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full h-32 bg-black/40 border border-neutral-800 rounded-xl p-4 text-white placeholder:text-neutral-700 outline-none focus:border-blue-500 transition-all resize-none font-sans text-sm"
                />
                
                <button
                  onClick={generateWithAI}
                  disabled={isGenerating || !aiPrompt.trim()}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                      Architecting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Build Snippet
                    </>
                  )}
                </button>
                <p className="text-[10px] text-neutral-600 text-center italic">Crafted by Gemini 3 Flash</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
