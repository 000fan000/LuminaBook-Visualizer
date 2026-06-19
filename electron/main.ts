import { app, BrowserWindow, ipcMain, Menu, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LlmProfileStoreState } from './bridge';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const PROFILE_STORE_FILE = 'llm-profiles.json';

interface StoredProfilePayload {
  encoding: 'safeStorage' | 'plain';
  value: string;
}

const getProfileStorePath = () => path.join(app.getPath('userData'), PROFILE_STORE_FILE);

const isProfileStoreState = (value: unknown): value is LlmProfileStoreState => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const state = value as LlmProfileStoreState;
  return (
    (state.activeProfileId === null || typeof state.activeProfileId === 'string') &&
    Array.isArray(state.profiles)
  );
};

const serializeProfileState = (state: LlmProfileStoreState): StoredProfilePayload => {
  const json = JSON.stringify(state);

  if (safeStorage.isEncryptionAvailable()) {
    return {
      encoding: 'safeStorage',
      value: safeStorage.encryptString(json).toString('base64'),
    };
  }

  return {
    encoding: 'plain',
    value: json,
  };
};

const deserializeProfileState = (payload: StoredProfilePayload): LlmProfileStoreState | null => {
  const json =
    payload.encoding === 'safeStorage'
      ? safeStorage.decryptString(Buffer.from(payload.value, 'base64'))
      : payload.value;
  const parsed = JSON.parse(json) as unknown;

  return isProfileStoreState(parsed) ? parsed : null;
};

const loadProfileState = async () => {
  try {
    const raw = await fs.readFile(getProfileStorePath(), 'utf8');
    const payload = JSON.parse(raw) as StoredProfilePayload;

    if (!payload || typeof payload.value !== 'string') {
      return null;
    }

    return deserializeProfileState(payload);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    console.warn('[LuminaBook] Could not load desktop LLM profiles.', error);
    return null;
  }
};

const saveProfileState = async (state: LlmProfileStoreState) => {
  if (!isProfileStoreState(state)) {
    throw new Error('Invalid LLM profile store payload.');
  }

  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(getProfileStorePath(), JSON.stringify(serializeProfileState(state), null, 2), 'utf8');
};

const createWindow = async () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    title: 'LuminaBook Reader',
    backgroundColor: '#f7f3ea',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

const installAppMenu = () => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

app.setName('LuminaBook Reader');

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('llm-profiles:load', () => loadProfileState());
ipcMain.handle('llm-profiles:save', (_event, state: LlmProfileStoreState) => saveProfileState(state));

app.whenReady().then(async () => {
  installAppMenu();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
