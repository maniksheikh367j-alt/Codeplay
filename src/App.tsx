import { useState, useEffect, useRef } from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import { 
  Terminal, Play, Trash2, Code, ShieldCheck, ShieldAlert, Cpu, Maximize2, Minimize2, 
  Wand2, Loader2, X, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = typeof process !== 'undefined' ? (process.env.GEMINI_API_KEY || "") : "";
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

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
}
`;

const DEFAULT_JS = `document.getElementById('btn').addEventListener('click', () => {
  alert('Live Preview is working! 🚀');
});`;

const STORAGE_KEYS = {
  HTML: 'codeplay_html_v1',
  CSS: 'codeplay_css_v1',
  JS: 'codeplay_js_v1',
};

type EditorTab = 'html' | 'css' | 'js';

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

  // AI State
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  // Auto-save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.HTML, html);
    localStorage.setItem(STORAGE_KEYS.CSS, css);
    localStorage.setItem(STORAGE_KEYS.JS, js);
  }, [html, css, js]);

  const generateWithAI = async () => {
    if (!ai) {
      alert("AI feature is currently unavailable (API Key missing).");
      return;
    }
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: `Generate only raw ${activeTab.toUpperCase()} code for the following request: ${aiPrompt}. 
        Do not include markdown code blocks, explanations, or any other text. Only provide the executable code.`,
      });
      
      const generatedCode = response.text || '';
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

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-500 bg-neutral-950 text-neutral-200 border-neutral-800">
      {/* Header */}
      <header className="px-6 py-4 border-b border-inherit bg-black/40 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/40">
            <Cpu className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-white leading-none">CodePlay</h1>
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest mt-1">Real-time Editor</p>
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
            title="Clear Code"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          
          <button
            onClick={updatePreview}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95 shadow-lg shadow-blue-600/20"
          >
            <Play className="w-4 h-4 fill-current" />
            <span className="hidden sm:inline">Run Code</span>
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
                <p className="text-[10px] text-neutral-600 text-center italic">Crafted by Gemini 1.5 Flash</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
