import apiClient from './client';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    username: string;
    role?: string;
  };
}

export interface GenerateNodeKeyResponse {
  success: boolean;
  key: string;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  key: string;
  fullKey?: string; // 完整key（用于复制）
  createdAt: number;
  lastUsedAt?: number;
  ownerId?: string;
}

export interface GenerateApiKeyRequest {
  name: string;
}

export interface GenerateApiKeyResponse {
  success: boolean;
  apiKey: ApiKeyInfo;
}

export interface ListApiKeysResponse {
  success: boolean;
  apiKeys: ApiKeyInfo[];
}

export const authApi = {
  /**
   * 登录
   */
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post('/admin/auth/login', credentials);
    return response.data;
  },

  /**
   * 登出
   */
  logout: async (): Promise<void> => {
    await apiClient.post('/admin/auth/logout');
  },

  // 已废弃接口，不再提供

  /**
   * 🆕 生成节点认证Key（节点之间的认证，用于WebSocket连接）
   */
  generateNodeKey: async (): Promise<GenerateNodeKeyResponse> => {
    const response = await apiClient.post('/admin/auth/generate-node-key');
    return response.data;
  },

  /**
   * 🆕 生成 API Key（客户端连接用）
   */
  generateApiKey: async (data: GenerateApiKeyRequest): Promise<GenerateApiKeyResponse> => {
    const response = await apiClient.post('/admin/auth/api-keys', data);
    return response.data;
  },

  /**
   * 🆕 获取所有 API Keys
   */
  listApiKeys: async (): Promise<ListApiKeysResponse> => {
    const response = await apiClient.get('/admin/auth/api-keys');
    return response.data;
  },

  /**
   * 🆕 删除 API Key
   */
  deleteApiKey: async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/auth/api-keys/${id}`);
  },
};

