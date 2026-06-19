import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'electron/main.ts',
      fileName: () => 'main.cjs',
      formats: ['cjs'],
    },
    sourcemap: true,
  },
});
