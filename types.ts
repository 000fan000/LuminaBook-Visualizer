
export enum AnimationType {
  FADE_IN = 'fade-in',
  TYPE_IN = 'type-in',
  GRADIENT_IN = 'gradient-in',
  SLIDE_UP = 'slide-up',
  BLUR_IN = 'blur-in',
  ZOOM_IN = 'zoom-in'
}

export type WritingMode = 'horizontal-tb' | 'vertical-rl' | 'vertical-lr';
export type TextDirection = 'ltr' | 'rtl';
export type FontFamily = 'serif' | 'sans' | 'mono' | 'zh-serif' | 'zh-sans' | 'zh-brush' | 'zh-ink';

export interface Scene {
  id: string;
  text: string;
  animation: AnimationType;
  duration: number;
  delay: number;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  color: string;
  background: string;
  fontFamily: FontFamily;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  writingMode: WritingMode;
  direction: TextDirection;
  language: 'en' | 'zh';
  visualPrompt?: string; 
}

export interface VisualizerConfig {
  title: string;
  scenes: Scene[];
  globalTransition: number;
  readingBuffer: number; // Extra time to stay on scene after animation finishes
}
