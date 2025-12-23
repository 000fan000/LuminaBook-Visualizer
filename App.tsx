
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Play, 
  Download, 
  Settings, 
  Trash2, 
  Layers, 
  Type as TypeIcon, 
  Palette, 
  Sparkles,
  ChevronRight,
  ChevronLeft,
  FileText,
  Clock,
  Layout,
  Square,
  Image as ImageIcon,
  Film,
  Loader2,
  AlertCircle,
  Monitor
} from 'lucide-react';
import { Scene, AnimationType, VisualizerConfig } from './types';
import PreviewCanvas from './components/PreviewCanvas';
import EditorPanel from './components/EditorPanel';
import SceneManager from './components/SceneManager';
import { analyzeTextMood } from './services/geminiService';
import { toPng } from 'html-to-image';
import { GoogleGenAI } from "@google/genai";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const INITIAL_SCENE: Scene = {
  id: '1',
  text: "Welcome to LuminaBook. Start typing your story...",
  animation: AnimationType.FADE_IN,
  duration: 2,
  delay: 0.5,
  fontSize: 48,
  letterSpacing: 0,
  lineHeight: 1.4,
  color: '#ffffff',
  background: '#0a0a0a',
  fontFamily: 'serif',
  textAlign: 'center',
  writingMode: 'horizontal-tb',
  direction: 'ltr',
  language: 'en'
};

const App: React.FC = () => {
  const [config, setConfig] = useState<VisualizerConfig>({
    title: "Untitled Story",
    scenes: [INITIAL_SCENE],
    globalTransition: 1.0,
    readingBuffer: 1.5
  });
  const [activeSceneId, setActiveSceneId] = useState<string>(INITIAL_SCENE.id);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayIndex, setCurrentPlayIndex] = useState(0);
  const [playSessionId, setPlaySessionId] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const activeScene = config.scenes.find(s => s.id === activeSceneId) || config.scenes[0];

  const ffmpegRef = useRef<FFmpeg | null>(null);

  const updateScene = (updatedScene: Scene) => {
    setConfig(prev => ({
      ...prev,
      scenes: prev.scenes.map(s => s.id === updatedScene.id ? updatedScene : s)
    }));
  };

  const addScene = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newScene: Scene = {
      ...activeScene,
      id: newId,
      text: activeScene.language === 'zh' ? "新篇章开始了..." : "New chapter begins..."
    };
    setConfig(prev => ({ ...prev, scenes: [...prev.scenes, newScene] }));
    setActiveSceneId(newId);
  };

  const deleteScene = (id: string) => {
    if (config.scenes.length <= 1) return;
    setConfig(prev => {
      const filtered = prev.scenes.filter(s => s.id !== id);
      if (activeSceneId === id) setActiveSceneId(filtered[0].id);
      return { ...prev, scenes: filtered };
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const paragraphs = content.split('\n').filter(p => p.trim() !== '');
      const isLikelyChinese = /[\u4e00-\u9fa5]/.test(content);
      
      const newScenes: Scene[] = paragraphs.map((p, i) => ({
        ...INITIAL_SCENE,
        id: `file-${i}-${Date.now()}`,
        text: p.trim(),
        language: isLikelyChinese ? 'zh' : 'en',
        fontFamily: isLikelyChinese ? 'zh-serif' : 'serif'
      }));
      setConfig(prev => ({ ...prev, scenes: newScenes }));
      setActiveSceneId(newScenes[0].id);
    };
    reader.readAsText(file);
  };

  const handleAIAnalyze = async () => {
    if (!activeScene.text.trim()) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeTextMood(activeScene.text);
      if (result) {
        updateScene({
          ...activeScene,
          background: result.colorTheme || activeScene.background,
          fontFamily: (result.fontStyle as any) || activeScene.fontFamily,
          animation: (result.suggestedAnimation as any) || activeScene.animation,
          visualPrompt: result.visualPrompt || activeScene.visualPrompt
        });
      }
    } catch (error) {
      console.error("AI Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    
    // Check for SharedArrayBuffer support (required for FFmpeg WASM multicore)
    if (typeof SharedArrayBuffer === 'undefined') {
      console.warn("SharedArrayBuffer is not supported. FFmpeg might be slow or fail.");
    }

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    const ffmpeg = new FFmpeg();
    
    // Log messages from FFmpeg
    ffmpeg.on('log', ({ message }) => {
      console.log('FFmpeg:', message);
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const exportLocalVideo = async () => {
    if (!previewRef.current) return;
    setIsExporting(true);
    setShowExportMenu(false);
    
    const ffmpeg = await loadFFmpeg();
    const fps = 25; // 25fps is more stable for browser-side rendering
    let frameCount = 0;

    try {
      setExportProgress("Initializing Video Engine...");
      
      // Stop any current playback
      setIsPlaying(false);
      
      for (let i = 0; i < config.scenes.length; i++) {
        const scene = config.scenes[i];
        setActiveSceneId(scene.id);
        
        // Wait for the scene to mount and trigger animations
        await new Promise(r => setTimeout(r, 600)); 

        const sceneTotalTime = (scene.delay || 0) + (scene.duration || 1) + (config.readingBuffer || 0);
        const steps = Math.ceil(sceneTotalTime * fps);

        for (let step = 0; step < steps; step++) {
          setExportProgress(`Capturing Scene ${i + 1}/${config.scenes.length}: Frame ${step}/${steps}`);
          
          // Small delay for DOM synchronization
          await new Promise(r => setTimeout(r, 1000 / fps)); 

          const dataUrl = await toPng(previewRef.current, { 
            pixelRatio: 1, // Manage memory by staying at 1x
            cacheBust: true,
          });
          
          // Efficiently convert dataUrl to Uint8Array
          const res = await fetch(dataUrl);
          const arrayBuffer = await res.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          await ffmpeg.writeFile(`frame${String(frameCount).padStart(5, '0')}.png`, uint8Array);
          frameCount++;
        }
      }

      setExportProgress("Encoding High-Quality MP4...");
      
      // Pad filter ensures even dimensions for libx264
      await ffmpeg.exec([
        '-framerate', String(fps),
        '-i', 'frame%05d.png',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', 
        '-preset', 'ultrafast',
        'output.mp4'
      ]);

      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.title.replace(/\s+/g, '_')}_local.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up virtual filesystem
      for(let j=0; j<frameCount; j++) {
        await ffmpeg.deleteFile(`frame${String(j).padStart(5, '0')}.png`).catch(() => {});
      }
      await ffmpeg.deleteFile('output.mp4').catch(() => {});

    } catch (err) {
      console.error("Local Export Error:", err);
      alert("Local recording failed. This usually happens due to memory limits or missing browser security headers (COOP/COEP). Try a shorter story or use the Cloud Video option.");
    } finally {
      setIsExporting(false);
    }
  };

  const exportImage = async () => {
    if (!previewRef.current) return;
    setIsExporting(true);
    setExportProgress("Generating high-resolution snapshot...");
    try {
      const dataUrl = await toPng(previewRef.current, { cacheBust: true, pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `LuminaBook_${activeSceneId}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export image', err);
    } finally {
      setIsExporting(false);
      setShowExportMenu(false);
    }
  };

  const togglePlayback = () => {
    if (!isPlaying) {
      setCurrentPlayIndex(0);
      setPlaySessionId(prev => prev + 1);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      setActiveSceneId(config.scenes[currentPlayIndex].id);
    }
  }, [isPlaying, currentPlayIndex]);

  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      const scene = config.scenes[currentPlayIndex];
      const totalDuration = (
        (scene.delay || 0) + 
        (scene.duration || 1) + 
        (config.readingBuffer || 0) + 
        (config.globalTransition || 0)
      ) * 1000;
      
      timer = setTimeout(() => {
        if (currentPlayIndex < config.scenes.length - 1) {
          setCurrentPlayIndex(prev => prev + 1);
        } else {
          setIsPlaying(false);
        }
      }, totalDuration);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, currentPlayIndex, config.scenes, config.globalTransition, config.readingBuffer]);

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-zinc-100 overflow-hidden font-sans">
      <AnimatePresence>
        {isExporting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-12 text-center"
          >
            <div className="relative mb-8">
              <Loader2 className="w-20 h-20 text-indigo-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 bg-indigo-500/20 blur-xl rounded-full animate-pulse" />
              </div>
            </div>
            <h2 className="text-3xl font-bold mb-4 tracking-tight bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
              {exportProgress}
            </h2>
            <p className="text-zinc-500 text-sm max-w-sm leading-relaxed">
              Your computer is doing some heavy lifting. <br/> 
              Keep this tab active and focused for the best performance.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={false}
        animate={{ width: isSidebarOpen ? 320 : 0 }}
        className="bg-[#111111] border-r border-zinc-800 flex flex-col relative"
      >
        <div className="p-6 flex items-center justify-between border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">LuminaBook</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-zinc-800 rounded-md transition-colors">
            <ChevronLeft className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <SceneManager 
            scenes={config.scenes} 
            activeId={activeSceneId} 
            onSelect={setActiveSceneId}
            onDelete={deleteScene}
          />
        </div>

        <div className="p-4 border-t border-zinc-800 bg-[#141414] shrink-0">
          <button 
            onClick={addScene}
            className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl flex items-center justify-center gap-2 transition-all font-medium border border-zinc-700 shadow-lg"
          >
            <Plus className="w-4 h-4" />
            Add Scene
          </button>
        </div>
      </motion.div>

      <div className="flex-1 flex flex-col relative overflow-hidden">
        {!isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-6 left-6 z-50 p-2 bg-zinc-800 rounded-full border border-zinc-700 shadow-xl"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        <header className="h-16 border-b border-zinc-800 bg-[#0c0c0c]/80 backdrop-blur-md flex items-center justify-between px-8 shrink-0 z-40">
          <div className="flex items-center gap-4">
            <input 
              value={config.title}
              onChange={e => setConfig(prev => ({...prev, title: e.target.value}))}
              className="bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-2 py-1 text-sm font-medium w-48"
              placeholder="Enter story title..."
            />
            <div className="h-4 w-[1px] bg-zinc-700" />
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <FileText className="w-4 h-4" />
              <span>{config.scenes.length} Scenes</span>
            </div>
          </div>

          <div className="flex items-center gap-3 relative">
            <label className="cursor-pointer px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm transition-all flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Import TXT
              <input type="file" accept=".txt" onChange={handleFileUpload} className="hidden" />
            </label>
            
            <div className="relative">
              <button 
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              
              <AnimatePresence>
                {showExportMenu && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2 z-50 overflow-hidden"
                  >
                    <div className="px-3 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800 mb-1">
                      Local Output
                    </div>
                    <button 
                      onClick={exportImage}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 rounded-lg text-sm flex items-center gap-3 transition-colors"
                    >
                      <ImageIcon className="w-4 h-4 text-emerald-400" />
                      <span>Scene Snapshot (PNG)</span>
                    </button>
                    <button 
                      onClick={exportLocalVideo}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 rounded-lg text-sm flex items-center gap-3 transition-colors group"
                    >
                      <Monitor className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                      <span>Record Local MP4</span>
                    </button>
                    
                    <div className="px-3 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-zinc-800 mt-2 mb-1">
                      AI Generated (Cloud)
                    </div>
                    <button 
                      onClick={async () => {
                         const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
                         alert("Cloud rendering initialized. Use Veo models if configured.");
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 rounded-lg text-sm flex items-center gap-3 transition-colors opacity-50 cursor-not-allowed"
                    >
                      <Film className="w-4 h-4 text-indigo-400" />
                      <span>AI Render (Veo)</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden">
          <section className="flex-1 relative flex flex-col bg-[#050505]">
            <div className="flex-1 flex items-center justify-center p-12 overflow-hidden">
              <div 
                ref={previewRef}
                className="w-full h-full max-w-5xl aspect-video rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/5 relative bg-black"
              >
                <PreviewCanvas 
                  scene={activeScene} 
                  isPlaying={isPlaying} 
                  playSessionId={playSessionId}
                />
              </div>
            </div>

            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-900/90 backdrop-blur-xl px-6 py-3 rounded-2xl border border-zinc-800 shadow-2xl z-50">
              <button 
                onClick={togglePlayback}
                className={`w-12 h-12 flex items-center justify-center rounded-full transition-all shadow-xl ${isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-500'}`}
              >
                {isPlaying ? <Square className="w-4 h-4 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
              </button>
              <div className="flex flex-col min-w-[140px]">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                  {isPlaying ? 'Live Preview' : 'Scene Editor'}
                </span>
                <span className="text-sm font-medium">
                  {isPlaying 
                    ? `Scene ${currentPlayIndex + 1} of ${config.scenes.length}` 
                    : `Editing Scene ${config.scenes.findIndex(s => s.id === activeSceneId) + 1}`
                  }
                </span>
              </div>
            </div>
          </section>

          <aside className="w-96 border-l border-zinc-800 bg-[#0f0f0f] flex flex-col overflow-y-auto custom-scrollbar">
            <div className="p-6 border-b border-zinc-800 flex items-center gap-2 text-zinc-400 uppercase text-[10px] font-bold tracking-widest">
              <Settings className="w-3 h-3" />
              Global Settings
            </div>
            
            <div className="p-6 border-b border-zinc-800 space-y-4">
               <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">Global Transition ({config.globalTransition}s)</span>
                </div>
                <input 
                  type="range" min="0" max="5" step="0.1"
                  value={config.globalTransition}
                  onChange={e => setConfig(prev => ({...prev, globalTransition: parseFloat(e.target.value)}))}
                  className="w-full accent-indigo-500"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">Reading Buffer ({config.readingBuffer}s)</span>
                </div>
                <input 
                  type="range" min="0" max="10" step="0.1"
                  value={config.readingBuffer}
                  onChange={e => setConfig(prev => ({...prev, readingBuffer: parseFloat(e.target.value)}))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>

            <div className="p-6 border-b border-zinc-800 flex items-center gap-2 text-zinc-400 uppercase text-[10px] font-bold tracking-widest">
              <Layers className="w-3 h-3" />
              Active Scene Properties
            </div>
            
            <div className="p-6 space-y-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    AI Visual Tuning
                  </label>
                  {isAnalyzing && <span className="text-[10px] animate-pulse text-indigo-400">Thinking...</span>}
                </div>
                <button 
                  onClick={handleAIAnalyze}
                  disabled={isAnalyzing}
                  className="w-full py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 rounded-lg text-sm font-medium transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  Apply AI Style
                </button>
              </div>

              <EditorPanel 
                scene={activeScene} 
                onChange={updateScene} 
              />
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default App;
