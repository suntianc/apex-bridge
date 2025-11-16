import apiClient from './client';

/**
 * 人格配置接口（与后端PersonalityConfig对应）
 */
export interface PersonalityConfig {
  identity: {
    name: string;
    avatar?: string;
    role?: string;
    age?: number;
    background?: string;
  };
  traits: {
    core: string[];
    interests?: string[];
    values?: string[];
  };
  style: {
    tone: string;
    address: string;
    emojiUsage: 'frequent' | 'moderate' | 'rare';
  };
  behavior?: {
    onSuccess?: string;
    onFailure?: string;
    onIdle?: string;
  };
  customPrompt?: string;
  metadata?: {
    version?: string;
    author?: string;
    description?: string;
    isTxtMode?: boolean;
  };
}

/**
 * 人格信息（列表项）
 */
export interface PersonalityInfo {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  role?: string;
  status: 'active' | 'inactive';
  filePath: string;
}

/**
 * 人格列表响应
 */
export interface PersonalityListResponse {
  success: boolean;
  personalities: PersonalityInfo[];
  total: number;
}

/**
 * 人格详情响应
 */
export interface PersonalityDetailResponse {
  success: boolean;
  personality: PersonalityConfig;
  id: string;
}

/**
 * 创建人格请求
 */
export interface CreatePersonalityRequest {
  id: string;
  config: PersonalityConfig;
}

/**
 * 更新人格请求
 */
export interface UpdatePersonalityRequest {
  config: PersonalityConfig;
}

export const personalityApi = {
  /**
   * 获取所有人格列表
   */
  getPersonalities: async (): Promise<PersonalityInfo[]> => {
    const response = await apiClient.get<PersonalityListResponse>('/admin/personalities');
    return response.data.personalities;
  },

  /**
   * 获取指定人格配置
   */
  getPersonality: async (id: string): Promise<PersonalityConfig> => {
    const response = await apiClient.get<PersonalityDetailResponse>(`/admin/personalities/${id}`);
    return response.data.personality;
  },

  /**
   * 创建新人格
   */
  createPersonality: async (id: string, config: PersonalityConfig): Promise<PersonalityConfig> => {
    const response = await apiClient.post<PersonalityDetailResponse>('/admin/personalities', {
      id,
      config
    });
    return response.data.personality;
  },

  /**
   * 更新人格配置
   */
  updatePersonality: async (id: string, config: PersonalityConfig): Promise<PersonalityConfig> => {
    const response = await apiClient.put<PersonalityDetailResponse>(`/admin/personalities/${id}`, config);
    return response.data.personality;
  },

  /**
   * 删除人格
   */
  deletePersonality: async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/personalities/${id}`);
  },
};

