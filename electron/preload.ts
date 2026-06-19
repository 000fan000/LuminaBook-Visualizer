import { contextBridge, ipcRenderer } from 'electron';
import { LlmProfileStoreState, LuminabookDesktopApi } from './bridge';

const api: LuminabookDesktopApi = {
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  loadLlmProfiles: () => ipcRenderer.invoke('llm-profiles:load'),
  saveLlmProfiles: (state: LlmProfileStoreState) => ipcRenderer.invoke('llm-profiles:save', state),
};

contextBridge.exposeInMainWorld('luminabook', api);

