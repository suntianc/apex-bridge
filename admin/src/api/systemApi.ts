import apiClient from './client';

export interface SystemStatus {
  server: {
    running: boolean;
    uptime: number;
    memory: {
      used: number;
      total: number;
      systemTotal: number;
      systemFree: number;
    };
    cpu: {
      usage: any;
      cores: number;
    };
  };
  nodes: {
    total: number;
    online: number;
    offline: number;
  };
  config: {
    setup_completed: boolean;
  };
}

export interface SystemStats {
  requests: {
    today: number;
    total: number;
  };
  conversations: {
    today: number;
    total: number;
  };
  nodes: {
    active: number;
    total: number;
  };
}

export interface SecurityStats {
  rateLimit: {
    enabled: boolean;
    provider: 'auto' | 'redis' | 'memory';
    totalRequests: number;
    blockedRequests: number;
    topBlockedRules: Array<{
      ruleId: string;
      ruleName: string;
      blockedCount: number;
    }>;
    topBlockedIdentities: Array<{
      strategy: string;
      value: string;
      blockedCount: number;
    }>;
  };
  raceConditions: {
    totalDetections: number;
    activeResources: number;
    topResources: Array<{
      resourceId: string;
      detectionCount: number;
    }>;
    lastDetection?: {
      resourceId: string;
      operationId: string;
      timestamp: number;
    };
  };
  validation: {
    totalValidated: number;
    totalRejected: number;
    rejectionReasons: Array<{
      reason: string;
      count: number;
    }>;
  };
  securityEvents: {
    suspiciousRequests: number;
    auditLogs: number;
    errors: number;
  };
}

export const systemApi = {
  /**
   * 获取系统状态
   */
  getStatus: async (): Promise<SystemStatus> => {
    const response = await apiClient.get('/admin/system/status');
    return response.data.status;
  },

  /**
   * 获取统计信息
   */
  getStats: async (): Promise<SystemStats> => {
    const response = await apiClient.get('/admin/system/stats');
    return response.data.stats;
  },

  /**
   * 获取安全统计信息
   */
  getSecurityStats: async (): Promise<SecurityStats> => {
    const response = await apiClient.get('/admin/system/security-stats');
    return response.data.stats;
  },
};

