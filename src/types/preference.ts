export type PreferencePrimitive = string | number | boolean;

export interface PreferenceEntry<T extends PreferencePrimitive = PreferencePrimitive> {
  key: string;
  value: T;
  source: 'session' | 'user' | 'default';
  updatedAt: number;
  ttlMs?: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export type PreferencePatch = Record<string, PreferencePrimitive>;

export interface PreferenceLayerSnapshot {
  layer: 'session' | 'user' | 'default';
  entries: Record<string, PreferenceEntry>;
}

export interface PreferenceView {
  merged: Record<string, PreferenceEntry>;
  sources: {
    session?: PreferenceLayerSnapshot;
    user?: PreferenceLayerSnapshot;
    default?: PreferenceLayerSnapshot;
  };
}

export interface PreferenceDefaultsProvider {
  getDefaults(): Record<string, PreferencePrimitive>;
}

export interface PreferenceServiceContract {
  setUserPreferences(userId: string, patch: PreferencePatch, options?: { ttlMs?: number; metadata?: Record<string, unknown> }): void;
  setSessionPreferences(sessionId: string, patch: PreferencePatch, options?: { ttlMs?: number; metadata?: Record<string, unknown> }): void;
  getView(params: { userId: string; sessionId?: string; defaults?: Record<string, PreferencePrimitive> }): PreferenceView;
  getUserPreferences(userId: string): Record<string, PreferenceEntry>;
  getSessionPreferences(sessionId: string): Record<string, PreferenceEntry>;
  deleteUserPreference(userId: string, key: string): void;
  deleteSessionPreference(sessionId: string, key: string): void;
  sweepExpired(): void;
}


