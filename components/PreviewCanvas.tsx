
import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scene, AnimationType } from '../types';

interface PreviewCanvasProps {
  scene: Scene;
  isPlaying: boolean;
  playSessionId?: number;
}

const PreviewCanvas: React.FC<PreviewCanvasProps> = ({ scene, isPlaying, playSessionId = 0 }) => {
  const chars = useMemo(() => scene.text.split(''), [scene.text]);

  const getAnimationProps = () => {
    const duration = scene.duration || 1;
    const delay = scene.delay || 0;
    
    const commonTransition = {
      duration: duration,
      delay: delay,
      ease: [0.22, 1, 0.36, 1] 
    };

    switch (scene.animation) {
      case AnimationType.TYPE_IN:
        const stagger = chars.length > 0 ? duration / chars.length : 0.05;
        return {
          container: {
            hidden: { opacity: 1 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: stagger,
                delayChildren: delay,
              },
            },
          },
          child: {
            hidden: { opacity: 0, y: 10 },
            visible: { 
              opacity: 1, 
              y: 0,
              transition: { duration: 0.2 } 
            },
          },
        };
      case AnimationType.GRADIENT_IN:
        const initialClip = scene.writingMode === 'horizontal-tb' 
          ? 'inset(0 100% 0 0)' 
          : 'inset(0 0 100% 0)';
        return {
          container: {
            hidden: { clipPath: initialClip, opacity: 0 },
            visible: { 
              clipPath: 'inset(0 0% 0 0)', 
              opacity: 1,
              transition: commonTransition 
            },
          },
          child: {},
        };
      case AnimationType.BLUR_IN:
        return {
          container: {
            hidden: { opacity: 0, filter: 'blur(30px)', scale: 0.9, y: 20 },
            visible: { 
              opacity: 1, 
              filter: 'blur(0px)', 
              scale: 1, 
              y: 0,
              transition: commonTransition 
            }
          },
          child: {}
        };
      case AnimationType.SLIDE_UP:
        const slideDir = scene.writingMode === 'horizontal-tb' ? { y: 60 } : { x: 60 };
        return {
          container: {
            hidden: { opacity: 0, ...slideDir },
            visible: { 
              opacity: 1, 
              y: 0, 
              x: 0, 
              transition: commonTransition 
            }
          },
          child: {}
        };
      case AnimationType.ZOOM_IN:
        return {
          container: {
            hidden: { opacity: 0, scale: 1.4, filter: 'blur(10px)' },
            visible: { 
              opacity: 1, 
              scale: 1, 
              filter: 'blur(0px)',
              transition: commonTransition 
            }
          },
          child: {}
        };
      case AnimationType.FADE_IN:
      default:
        return {
          container: {
            hidden: { opacity: 0 },
            visible: { 
              opacity: 1, 
              transition: { ...commonTransition, ease: "linear" } 
            },
          },
          child: {},
        };
    }
  };

  const anim = getAnimationProps();

  const getFontClass = () => {
    switch (scene.fontFamily) {
      case 'zh-serif': return 'font-zh-serif';
      case 'zh-sans': return 'font-zh-sans';
      case 'zh-brush': return 'font-zh-brush';
      case 'zh-ink': return 'font-zh-ink';
      case 'serif': return 'font-serif';
      case 'mono': return 'font-mono';
      default: return 'font-sans';
    }
  };

  const alignClass = scene.textAlign === 'center' ? 'text-center' : 
                     scene.textAlign === 'right' ? 'text-right' : 
                     scene.textAlign === 'justify' ? 'text-justify' : 'text-left';
  const writingClass = scene.writingMode === 'vertical-rl' ? 'writing-v-rl' : scene.writingMode === 'vertical-lr' ? 'writing-v-lr' : 'writing-h-tb';

  // Include isPlaying and playSessionId in the key to force re-render when playback starts
  const animationKey = `${scene.id}-${isPlaying}-${playSessionId}-${scene.animation}-${scene.text.substring(0, 20)}-${scene.duration}-${scene.delay}-${scene.fontSize}-${scene.writingMode}`;

  return (
    <div 
      className="w-full h-full flex items-center justify-center p-12 transition-colors duration-1000 relative overflow-hidden"
      style={{ backgroundColor: scene.background, direction: scene.direction }}
    >
      <div className="absolute inset-0 overflow-hidden opacity-40 pointer-events-none">
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-indigo-500/5 blur-[120px] rounded-full" 
        />
        <motion.div 
          animate={{ 
            scale: [1.1, 1, 1.1],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-20%] right-[-20%] w-[70%] h-[70%] bg-violet-500/5 blur-[150px] rounded-full" 
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={animationKey}
          initial="hidden"
          animate="visible"
          exit={{ opacity: 0, filter: 'blur(20px)', transition: { duration: 0.4 } }}
          variants={anim.container}
          className={`relative z-10 ${getFontClass()} ${alignClass} ${writingClass}`}
          style={{ 
            color: scene.color, 
            fontSize: `${scene.fontSize}px`,
            letterSpacing: `${scene.letterSpacing}px`,
            lineHeight: scene.lineHeight,
            fontWeight: 300,
            maxWidth: '85%',
            maxHeight: '85%',
            textShadow: '0 2px 40px rgba(0,0,0,0.15)',
            textAlign: scene.textAlign === 'justify' ? 'justify' : undefined,
            textAlignLast: scene.textAlign === 'justify' ? 'justify' : undefined
          }}
        >
          {scene.animation === AnimationType.TYPE_IN ? (
            chars.map((char, i) => (
              <motion.span 
                key={`${animationKey}-char-${i}`} 
                variants={anim.child} 
                className="inline-block whitespace-pre"
              >
                {char}
              </motion.span>
            ))
          ) : (
            <span className="inline-block">{scene.text}</span>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,0.85)]" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-black/20" />
    </div>
  );
};

export default PreviewCanvas;
