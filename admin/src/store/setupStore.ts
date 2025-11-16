import { create } from 'zustand';
import { setupApi } from '@/api/setupApi';

interface SetupState {
  isSetupCompleted: boolean;
  hasEnvFile: boolean;
  checkSetupStatus: () => Promise<void>;
}

export const useSetupStore = create<SetupState>((set, get) => ({
  isSetupCompleted: false,
  hasEnvFile: false,
  checkSetupStatus: async () => {
    try {
      const status = await setupApi.getStatus();
      const previousStatus = get().isSetupCompleted;
      set({
        isSetupCompleted: status.setup_completed,
        hasEnvFile: status.has_env_file,
      });
      // 如果状态从false变为true，触发重新渲染
      if (!previousStatus && status.setup_completed) {
        console.log('[SetupStore] Setup status changed from false to true');
      }
    } catch (error) {
      console.error('Failed to check setup status:', error);
    }
  },
}));

