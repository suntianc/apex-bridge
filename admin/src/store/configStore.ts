import { create } from 'zustand';
import { configApi, AdminConfig } from '@/api/configApi';

interface ConfigState {
  config: AdminConfig | null;
  loading: boolean;
  error: string | null;
  loadConfig: () => Promise<void>;
  updateConfig: (updates: Partial<AdminConfig>) => Promise<boolean>; // 返回是否需要重启
  resetConfig: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  loading: false,
  error: null,
  loadConfig: async () => {
    set({ loading: true, error: null });
    try {
      const config = await configApi.getConfig();
      set({ config, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },
  updateConfig: async (updates) => {
    try {
      const result = await configApi.updateConfig(updates);
      await get().loadConfig(); // 重新加载配置
      return result.requires_restart || false;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },
  resetConfig: async () => {
    try {
      await configApi.resetConfig();
      await get().loadConfig(); // 重新加载配置
    } catch (error: any) {
      set({ error: error.message });
    }
  },
}));

