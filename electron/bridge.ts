import { LlmProfile } from '../types';

export interface LlmProfileStoreState {
  activeProfileId: string | null;
  profiles: LlmProfile[];
}

export interface LuminabookDesktopApi {
  getAppVersion: () => Promise<string>;
  loadLlmProfiles: () => Promise<LlmProfileStoreState | null>;
  saveLlmProfiles: (state: LlmProfileStoreState) => Promise<void>;
}

