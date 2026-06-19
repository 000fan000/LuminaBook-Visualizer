/// <reference types="vite/client" />
/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import type { LuminabookDesktopApi } from './electron/bridge';

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}

declare global {
  interface Window {
    luminabook?: LuminabookDesktopApi;
  }
}
