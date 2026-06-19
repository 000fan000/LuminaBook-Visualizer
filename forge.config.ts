import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: 'com.luminabook.reader',
    appCategoryType: 'public.app-category.education',
    executableName: 'LuminaBook Reader',
    name: 'LuminaBook Reader',
  },
  makers: [
    new MakerZIP({}, ['darwin']),
    new MakerDMG(
      {
        name: 'LuminaBook Reader',
      },
      ['darwin'],
    ),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'electron/main.ts',
          config: 'vite.main.config.ts',
        },
        {
          entry: 'electron/preload.ts',
          config: 'vite.preload.config.ts',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;

