/**
 * Async Result Types
 * 
 * 异步结果相关的类型定义
 * 
 * @module types/async-result
 */

/**
 * AsyncResultData Type
 * 
 * 异步结果数据类型定义
 
 */
export interface AsyncResultData {
  /** 请求ID */
  requestId: string;
  
  /** 状态 */
  status: 'Succeed' | 'Failed' | 'Pending';
  
  /** 时间戳 */
  timestamp: number;
  
  /** 插件名称 */
  pluginName: string;
  
  /** 消息内容 */
  message?: string;
  
  /** 内容数据 */
  content?: string;
  
  /** 失败原因 */
  reason?: string;
  
  /** 其他扩展字段 */
  [key: string]: any;
}

/**
 * 插件回调请求体
 */
export interface CallbackRequest extends Partial<AsyncResultData> {
  requestId?: string;
  status?: 'Succeed' | 'Failed' | 'Pending';
  message?: string;
  reason?: string; // 失败原因
  [key: string]: any;
}

/**
 * 插件回调响应
 */
export interface CallbackResponse {
  status: 'success' | 'error';
  message: string;
  taskId?: string;
  pluginName?: string;
  error?: string;
  details?: any;
}

/**
 * 清理统计信息
 */
export interface CleanupStats {
  deletedDirs: number;
  deletedFiles: number;
  timestamp: number;
}

