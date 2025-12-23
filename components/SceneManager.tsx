
import React from 'react';
import { motion, Reorder } from 'framer-motion';
import { Scene } from '../types';
import { Trash2, GripVertical, FileText } from 'lucide-react';

interface SceneManagerProps {
  scenes: Scene[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const SceneManager: React.FC<SceneManagerProps> = ({ scenes, activeId, onSelect, onDelete }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2 pb-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
        <FileText className="w-3 h-3" />
        Scenes
      </div>
      {scenes.map((scene, index) => (
        <motion.div
          key={scene.id}
          layout
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className={`group flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
            activeId === scene.id 
            ? 'bg-zinc-800 border-indigo-500/50 shadow-lg shadow-indigo-500/5' 
            : 'bg-zinc-900/50 border-transparent hover:border-zinc-700'
          }`}
          onClick={() => onSelect(scene.id)}
        >
          <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${activeId === scene.id ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
            {index + 1}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className={`text-xs truncate font-medium ${activeId === scene.id ? 'text-zinc-100' : 'text-zinc-500'}`}>
              {scene.text || "Empty Scene"}
            </p>
            <p className="text-[10px] text-zinc-600 font-mono mt-0.5 uppercase tracking-tighter">
              {scene.animation} • {scene.duration}s
            </p>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(scene.id);
            }}
            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded-lg text-zinc-600 hover:text-red-400 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      ))}
    </div>
  );
};

export default SceneManager;
