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
  AlertCircle
} from 'lucide-react';
import { Scene, AnimationType, VisualizerConfig } from './types';
import PreviewCanvas from './components/PreviewCanvas';
import EditorPanel from './components/EditorPanel';
import SceneManager from './components/SceneManager';
import { analyzeTextMood } from './services/geminiService';
import { toPng } from 'html-to-image';
import { GoogleGenAI } from "@google/genai";

// Redundant window.aistudio declaration removed as it is provided by the execution environment

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
    setIsAnalyzing(true);
    const result = await analyzeTextMood(activeScene.text);
    if (result) {
      let font: any = result.fontStyle;
      if (activeScene.language === 'zh') {
         if (font === 'serif') font = 'zh-serif';
         else if (font === 'sans') font = 'zh-sans';
      }
      
      updateScene({
        ...activeScene,
        color: result.colorTheme,
        fontFamily: font,
        animation: result.suggestedAnimation as AnimationType,
        visualPrompt: result.visualPrompt
      });
    }
    setIsAnalyzing(false);
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

  const exportVideo = async () => {
    try {
      // Check if user has selected a paid API key for Veo models
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
      }

      setIsExporting(true);
      setExportProgress("Initializing Cinematic Render Engine...");
      
      // Initialize GoogleGenAI instance right before the call
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = activeScene.visualPrompt 
        ? `A cinematic visualization for the following text: "${activeScene.text}". Visual style: ${activeScene.visualPrompt}`
        : `A cinematic visualization of this text: "${activeScene.text}" with elegant typography.`;

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: {
          numberOfVideos: 1,
          resolution: '1080p',
          aspectRatio: '16:9'
        }
      });

      const messages = [
        "Analyzing text semantics...",
        "Composing cinematic sequence...",
        "Applying visual layers...",
        "Rendering lighting and atmospherics...",
        "Finalizing cinematic polish..."
      ];
      let msgIdx = 0;

      while (!operation.done) {
        setExportProgress(messages[msgIdx % messages.length]);
        msgIdx++;
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({operation: operation});
      }

      setExportProgress("Download ready...");
      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        // Must append API key when fetching from the download link
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${config.title.replace(/\s+/g, '_')}_render.mp4`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      console.error('Failed to export video', err);
      if (err.message?.includes("Requested entity was not found")) {
        // Reset key selection if the request fails due to missing project configuration
        await window.aistudio.openSelectKey();
      } else {
        alert("Video generation failed. Please try again or check your API key.");
      }
    } finally {
      setIsExporting(false);
      setShowExportMenu(false);
    }
  };

  const downloadConfig = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${config.title.replace(/\s+/g, '_')}.luminabook.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
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

  // Sync active scene with playback progress
  useEffect(() => {
    if (isPlaying) {
      setActiveSceneId(config.scenes[currentPlayIndex].id);
    }
  }, [isPlaying, currentPlayIndex, config.scenes]);

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
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-12 text-center"
          >
            <Loader2 className="w-16 h-16 text-indigo-500 animate-spin mb-6" />
            <h2 className="text-2xl font-bold mb-2">{exportProgress}</h2>
            <p className="text-zinc-500 text-sm max-w-xs">Please stay on this page while we process your cinematic export.</p>
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
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 hover:bg-zinc-800 rounded-md transition-colors"
          >
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
                    className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2 z-50"
                  >
                    <button 
                      onClick={exportImage}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 rounded-lg text-sm flex items-center gap-3 transition-colors"
                    >
                      <ImageIcon className="w-4 h-4 text-emerald-400" />
                      <span>Scene Snapshot (PNG)</span>
                    </button>
                    <button 
                      onClick={exportVideo}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 rounded-lg text-sm flex items-center gap-3 transition-colors"
                    >
                      <Film className="w-4 h-4 text-indigo-400" />
                      <span>Cinematic Render (MP4)</span>
                    </button>
                    <div className="h-[1px] bg-zinc-800 my-1" />
                    <button 
                      onClick={downloadConfig}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 rounded-lg text-sm flex items-center gap-3 transition-colors"
                    >
                      <FileText className="w-4 h-4 text-zinc-400" />
                      <span>Project JSON</span>
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
                  {isPlaying ? 'Playing Story' : 'Scene Editor'}
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
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">Hang Time ({config.readingBuffer}s)</span>
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