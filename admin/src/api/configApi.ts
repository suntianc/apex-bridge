import apiClient from './client';

export interface ApiKeyInfo {
  id: string;
  name: string;
  key: string;
  createdAt: number;
  lastUsedAt?: number;
  ownerId?: string;
}

export interface AdminConfig {
  setup_completed?: boolean;
  server: {
    port: number;
    host: string;
    nodeEnv: 'development' | 'production' | 'test';
    debugMode: boolean;
  };
  auth: {
    apiKey: string; // 原vcpKey，用于节点之间的认证（WebSocket），现改为apiKey
    apiKeys: ApiKeyInfo[];  // 🆕 从 string[] 改为 ApiKeyInfo[]，用于客户端HTTP API认证
    admin?: {
      username: string;
      password: string;
    };
  };
  [key: string]: any;
}

export const configApi = {
  /**
   * 读取所有配置
   */
  getConfig: async (): Promise<AdminConfig> => {
    const response = await apiClient.get('/admin/config');
    return response.data.config;
  },

  /**
   * 更新配置
   */
  updateConfig: async (config: Partial<AdminConfig>): Promise<{ requires_restart: boolean }> => {
    const response = await apiClient.put('/admin/config', { config });
    return response.data;
  },

  /**
   * 重置为默认配置
   */
  resetConfig: async (): Promise<void> => {
    await apiClient.post('/admin/config/reset');
  },

  /**
   * 导出配置
   */
  exportConfig: async (): Promise<Blob> => {
    const response = await apiClient.get('/admin/config/export', {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * 导入配置
   */
  importConfig: async (config: AdminConfig): Promise<{ requires_restart: boolean }> => {
    const response = await apiClient.post('/admin/config/import', { config });
    return response.data;
  },
};

