import apiClient from './client';

/**
 * 关系类型
 */
export type RelationshipType = 'family' | 'friend' | 'colleague' | 'other';

/**
 * 关系信息（与后端Relationship对应）
 */
export interface Relationship {
  type: RelationshipType;
  name: string;
  birthday?: string;
  anniversary?: string;
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  notes?: string;
}

/**
 * 存储的关系（包含ID和时间戳）
 */
export interface StoredRelationship extends Relationship {
  id: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 关系提醒信息
 */
export interface RelationshipReminder {
  relationshipId: string;
  relationshipName: string;
  eventType: 'birthday' | 'anniversary';
  eventDate: string;
  daysUntil: number;
}

/**
 * 关系列表响应
 */
export interface RelationshipListResponse {
  success: boolean;
  relationships: StoredRelationship[];
  total: number;
}

/**
 * 关系详情响应
 */
export interface RelationshipDetailResponse {
  success: boolean;
  relationship: StoredRelationship;
}

/**
 * 关系提醒响应
 */
export interface RelationshipRemindersResponse {
  success: boolean;
  reminders: RelationshipReminder[];
  total: number;
}

/**
 * 创建关系请求
 */
export interface CreateRelationshipRequest {
  userId: string;
  relationship: Relationship;
}

/**
 * 更新关系请求
 */
export interface UpdateRelationshipRequest {
  userId: string;
  relationship: Partial<Relationship>;
}

export const relationshipApi = {
  /**
   * 获取用户关系列表
   */
  getRelationships: async (userId: string): Promise<StoredRelationship[]> => {
    const response = await apiClient.get<RelationshipListResponse>('/admin/relationships', {
      params: { userId }
    });
    return response.data.relationships;
  },

  /**
   * 获取指定关系详情
   */
  getRelationship: async (id: string, userId: string): Promise<StoredRelationship> => {
    const response = await apiClient.get<RelationshipDetailResponse>(`/admin/relationships/${id}`, {
      params: { userId }
    });
    return response.data.relationship;
  },

  /**
   * 创建新关系
   */
  createRelationship: async (userId: string, relationship: Relationship): Promise<StoredRelationship> => {
    const response = await apiClient.post<RelationshipDetailResponse>('/admin/relationships', {
      userId,
      relationship
    });
    return response.data.relationship;
  },

  /**
   * 更新关系
   */
  updateRelationship: async (id: string, userId: string, relationship: Partial<Relationship>): Promise<StoredRelationship> => {
    const response = await apiClient.put<RelationshipDetailResponse>(`/admin/relationships/${id}`, {
      userId,
      relationship
    });
    return response.data.relationship;
  },

  /**
   * 删除关系
   */
  deleteRelationship: async (id: string, userId: string): Promise<void> => {
    await apiClient.delete(`/admin/relationships/${id}`, {
      params: { userId }
    });
  },

  /**
   * 获取关系提醒
   */
  getRelationshipReminders: async (id: string, userId: string): Promise<RelationshipReminder[]> => {
    const response = await apiClient.get<RelationshipRemindersResponse>(`/admin/relationships/${id}/reminders`, {
      params: { userId }
    });
    return response.data.reminders;
  },
};

