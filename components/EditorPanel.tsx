
import React from 'react';
import { Scene, AnimationType, WritingMode, TextDirection, FontFamily } from '../types';
import { 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify,
  Type as TypeIcon,
  Timer,
  Maximize2,
  Hash,
  Languages,
  ArrowRightLeft,
  Layout,
  Pencil
} from 'lucide-react';

interface EditorPanelProps {
  scene: Scene;
  onChange: (scene: Scene) => void;
}

const EditorPanel: React.FC<EditorPanelProps> = ({ scene, onChange }) => {
  const handleChange = (key: keyof Scene, value: any) => {
    onChange({ ...scene, [key]: value });
  };

  const handleNumberChange = (key: keyof Scene, val: string) => {
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) {
      handleChange(key, parsed);
    } else {
      // Allow empty string temporarily or fallback to 0
      handleChange(key, 0);
    }
  };

  const fonts: { id: FontFamily; label: string; isZh?: boolean }[] = [
    { id: 'serif', label: 'Serif' },
    { id: 'sans', label: 'Sans' },
    { id: 'mono', label: 'Mono' },
    { id: 'zh-serif', label: '宋体', isZh: true },
    { id: 'zh-sans', label: '黑体', isZh: true },
    { id: 'zh-brush', label: '楷书', isZh: true },
    { id: 'zh-ink', label: '草书', isZh: true },
  ];

  return (
    <div className="space-y-8 pb-12">
      <div className="space-y-4">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <Languages className="w-3 h-3" />
          Language & Typography
        </label>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <span className="text-[10px] text-zinc-500">Language</span>
            <select 
              value={scene.language}
              onChange={e => handleChange('language', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none"
            >
              <option value="en">English</option>
              <option value="zh">中文 (Chinese)</option>
            </select>
          </div>
          <div className="space-y-2">
            <span className="text-[10px] text-zinc-500">Writing Mode</span>
            <select 
              value={scene.writingMode}
              onChange={e => handleChange('writingMode', e.target.value as WritingMode)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none"
            >
              <option value="horizontal-tb">Horizontal</option>
              <option value="vertical-rl">Vertical (R-L)</option>
              <option value="vertical-lr">Vertical (L-R)</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] text-zinc-500">Font Family</span>
          <div className="grid grid-cols-3 gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            {fonts.map(font => (
              <button
                key={font.id}
                onClick={() => handleChange('fontFamily', font.id)}
                className={`py-1.5 text-[10px] rounded-lg transition-all ${scene.fontFamily === font.id ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <TypeIcon className="w-3 h-3" />
          Content
        </label>
        <textarea 
          value={scene.text}
          onChange={e => handleChange('text', e.target.value)}
          className={`w-full h-24 bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed transition-all ${scene.language === 'zh' ? 'font-zh-serif' : ''}`}
          placeholder={scene.language === 'zh' ? "在此输入文字..." : "Enter text..."}
        />
      </div>

      <div className="space-y-4">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <Timer className="w-3 h-3" />
          Animation Control
        </label>
        <select 
          value={scene.animation}
          onChange={e => handleChange('animation', e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 appearance-none transition-all cursor-pointer"
        >
          {Object.values(AnimationType).map(type => (
            <option key={type} value={type}>{type.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}</option>
          ))}
        </select>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <span className="text-[10px] text-zinc-500">Duration (s)</span>
            <input 
              type="number" step="0.1" min="0" 
              value={scene.duration}
              onChange={e => handleNumberChange('duration', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-2">
            <span className="text-[10px] text-zinc-500">Delay (s)</span>
            <input 
              type="number" step="0.1" min="0" 
              value={scene.delay}
              onChange={e => handleNumberChange('delay', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <Maximize2 className="w-3 h-3" />
          Layout & Spacing
        </label>

        <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          {(['left', 'center', 'right', 'justify'] as const).map(align => (
            <button
              key={align}
              onClick={() => handleChange('textAlign', align)}
              title={align === 'justify' ? '两端对齐' : align}
              className={`flex-1 py-1.5 flex justify-center rounded-lg transition-all ${scene.textAlign === align ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {align === 'left' ? <AlignLeft className="w-4 h-4" /> : 
               align === 'center' ? <AlignCenter className="w-4 h-4" /> : 
               align === 'right' ? <AlignRight className="w-4 h-4" /> : 
               <AlignJustify className="w-4 h-4" />}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-[10px] text-zinc-500">Size ({scene.fontSize}px)</span>
            </div>
            <input 
              type="range" min="12" max="150" 
              value={scene.fontSize}
              onChange={e => handleChange('fontSize', parseInt(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-[10px] text-zinc-500">Letter Spacing ({scene.letterSpacing}px)</span>
            </div>
            <input 
              type="range" min="-10" max="40" step="1"
              value={scene.letterSpacing}
              onChange={e => handleChange('letterSpacing', parseInt(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <Hash className="w-3 h-3" />
          Aesthetics
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <span className="text-[10px] text-zinc-500">Text Color</span>
            <div className="flex items-center gap-2">
               <input 
                type="color" 
                value={scene.color}
                onChange={e => handleChange('color', e.target.value)}
                className="w-8 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
              />
              <span className="text-[10px] font-mono text-zinc-400">{scene.color.toUpperCase()}</span>
            </div>
          </div>
          <div className="space-y-2">
            <span className="text-[10px] text-zinc-500">Background</span>
            <div className="flex items-center gap-2">
              <input 
                type="color" 
                value={scene.background}
                onChange={e => handleChange('background', e.target.value)}
                className="w-8 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
              />
              <span className="text-[10px] font-mono text-zinc-400">{scene.background.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorPanel;
