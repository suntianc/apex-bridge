import { PreferenceEntry, PreferencePatch, PreferencePrimitive, PreferenceServiceContract, PreferenceView } from '../types/preference';

type Layer = 'session' | 'user' | 'default';

export class PreferenceService implements PreferenceServiceContract {
  private readonly userStore: Map<string, Record<string, PreferenceEntry>> = new Map();
  private readonly sessionStore: Map<string, Record<string, PreferenceEntry>> = new Map();
  private readonly defaultStore: Record<string, PreferenceEntry> = {};

  constructor(defaults?: Record<string, PreferencePrimitive>) {
    if (defaults) {
      const now = Date.now();
      Object.keys(defaults).forEach((key) => {
        this.defaultStore[key] = {
          key,
          value: defaults[key],
          source: 'default',
          updatedAt: now,
        };
      });
    }
  }

  setUserPreferences(userId: string, patch: PreferencePatch, options?: { ttlMs?: number; metadata?: Record<string, unknown> }): void {
    const now = Date.now();
    const bucket = this.ensureBucket('user', userId);
    Object.entries(patch).forEach(([key, value]) => {
      const entry: PreferenceEntry = {
        key,
        value,
        source: 'user',
        updatedAt: now,
        ttlMs: options?.ttlMs,
        expiresAt: options?.ttlMs ? now + options.ttlMs : undefined,
        metadata: options?.metadata,
      };
      bucket[key] = entry;
    });
  }

  setSessionPreferences(sessionId: string, patch: PreferencePatch, options?: { ttlMs?: number; metadata?: Record<string, unknown> }): void {
    const now = Date.now();
    const bucket = this.ensureBucket('session', sessionId);
    Object.entries(patch).forEach(([key, value]) => {
      const entry: PreferenceEntry = {
        key,
        value,
        source: 'session',
        updatedAt: now,
        ttlMs: options?.ttlMs,
        expiresAt: options?.ttlMs ? now + options.ttlMs : undefined,
        metadata: options?.metadata,
      };
      bucket[key] = entry;
    });
  }

  getView(params: { userId: string; sessionId?: string; defaults?: Record<string, PreferencePrimitive> }): PreferenceView {
    this.sweepExpired();
    const now = Date.now();
    // Optional runtime defaults to overlay base defaults
    const defaultLayer = { ...this.defaultStore };
    if (params.defaults) {
      Object.entries(params.defaults).forEach(([key, value]) => {
        defaultLayer[key] = {
          key,
          value,
          source: 'default',
          updatedAt: now,
        };
      });
    }

    const userLayer = this.userStore.get(params.userId) ?? {};
    const sessionLayer = params.sessionId ? this.sessionStore.get(params.sessionId) ?? {} : {};

    // precedence: session > user > default
    const merged: Record<string, PreferenceEntry> = {};
    const keys = new Set<string>([
      ...Object.keys(defaultLayer),
      ...Object.keys(userLayer),
      ...Object.keys(sessionLayer),
    ]);
    keys.forEach((key) => {
      const entry = sessionLayer[key] ?? userLayer[key] ?? defaultLayer[key];
      if (entry) {
        merged[key] = entry;
      }
    });

    return {
      merged,
      sources: {
        session: Object.keys(sessionLayer).length > 0 ? { layer: 'session', entries: sessionLayer } : undefined,
        user: Object.keys(userLayer).length > 0 ? { layer: 'user', entries: userLayer } : undefined,
        default: Object.keys(defaultLayer).length > 0 ? { layer: 'default', entries: defaultLayer } : undefined,
      },
    };
  }

  getUserPreferences(userId: string): Record<string, PreferenceEntry> {
    this.sweepExpired();
    return this.userStore.get(userId) ?? {};
  }

  getSessionPreferences(sessionId: string): Record<string, PreferenceEntry> {
    this.sweepExpired();
    return this.sessionStore.get(sessionId) ?? {};
  }

  deleteUserPreference(userId: string, key: string): void {
    const bucket = this.userStore.get(userId);
    if (bucket && key in bucket) {
      delete bucket[key];
    }
  }

  deleteSessionPreference(sessionId: string, key: string): void {
    const bucket = this.sessionStore.get(sessionId);
    if (bucket && key in bucket) {
      delete bucket[key];
    }
  }

  sweepExpired(): void {
    const now = Date.now();
    const sweep = (record: Record<string, PreferenceEntry>) => {
      Object.keys(record).forEach((k) => {
        const e = record[k];
        if (e.expiresAt !== undefined && e.expiresAt <= now) {
          delete record[k];
        }
      });
    };
    this.userStore.forEach((rec) => sweep(rec));
    this.sessionStore.forEach((rec) => sweep(rec));
    // defaults are static, not swept
  }

  private ensureBucket(layer: Layer, id: string): Record<string, PreferenceEntry> {
    if (layer === 'user') {
      if (!this.userStore.has(id)) {
        this.userStore.set(id, {});
      }
      return this.userStore.get(id)!;
    }
    if (layer === 'session') {
      if (!this.sessionStore.has(id)) {
        this.sessionStore.set(id, {});
      }
      return this.sessionStore.get(id)!;
    }
    return this.defaultStore;
  }
}


