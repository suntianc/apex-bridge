import apiClient from './client';

export interface SetupStatus {
  setup_completed: boolean;
  has_env_file: boolean;
  config_file_exists: boolean;
}

export const setupApi = {
  /**
   * 获取设置状态
   */
  getStatus: async (): Promise<SetupStatus> => {
    const response = await apiClient.get('/setup/status');
    return response.data;
  },

  /**
   * 完成设置向导
   */
  completeSetup: async (config: any): Promise<void> => {
    await apiClient.post('/setup/complete', { config });
  },

  /**
   * 从.env文件导入配置
   */
  migrateFromEnv: async (): Promise<any> => {
    const response = await apiClient.post('/setup/migrate-from-env');
    return response.data;
  },
};

