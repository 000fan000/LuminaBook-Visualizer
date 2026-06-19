import type { LlmProfileStoreState } from '../electron/bridge';

const getDesktopApi = () => (typeof window === 'undefined' ? undefined : window.luminabook);

export const hasDesktopProfileStore = () => Boolean(getDesktopApi());

export const loadDesktopLlmProfiles = async () => {
  const api = getDesktopApi();
  return api ? api.loadLlmProfiles() : null;
};

export const saveDesktopLlmProfiles = async (state: LlmProfileStoreState) => {
  const api = getDesktopApi();

  if (!api) {
    return;
  }

  await api.saveLlmProfiles(state);
};

