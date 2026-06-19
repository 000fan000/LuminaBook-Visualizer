import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'electron/preload.ts',
      fileName: () => 'preload.cjs',
      formats: ['cjs'],
    },
    sourcemap: true,
  },
});
