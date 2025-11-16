import apiClient from './client';

export interface NodeInfo {
  id: string;
  name: string;
  type?: 'worker' | 'companion' | 'custom' | 'hub';
  status: 'online' | 'offline' | 'busy' | 'unknown';
  registeredAt: number;
  lastSeen?: number;
  capabilities?: string[];
  tools?: string[];
  boundPersona?: string | null;
  boundPersonas?: string[];
  config?: {
    endpoint?: string;
    capabilities?: string[];
    metadata?: Record<string, any>;
  };
}

export const nodeApi = {
  /**
   * 获取节点列表
   */
  getNodes: async (): Promise<NodeInfo[]> => {
    const response = await apiClient.get('/admin/nodes');
    return response.data.nodes;
  },

  /**
   * 获取节点详情
   */
  getNode: async (id: string): Promise<NodeInfo> => {
    const response = await apiClient.get(`/admin/nodes/${id}`);
    return response.data.node;
  },

  /**
   * 注册新节点
   */
  registerNode: async (node: Omit<NodeInfo, 'id' | 'registeredAt' | 'status'>): Promise<NodeInfo> => {
    const response = await apiClient.post('/admin/nodes', node);
    return response.data.node;
  },

  /**
   * 更新节点
   */
  updateNode: async (id: string, updates: Partial<NodeInfo>): Promise<NodeInfo> => {
    const response = await apiClient.put(`/admin/nodes/${id}`, updates);
    return response.data.node;
  },

  /**
   * 删除节点
   */
  deleteNode: async (id: string): Promise<void> => {
    await apiClient.delete(`/admin/nodes/${id}`);
  },
};

