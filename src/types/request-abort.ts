/**
 * Request Abort Types
 * 
 * 请求中断相关的类型定义
 * 
 * @module types/request-abort
 */

/**
 * 活动请求信息
 */
export interface ActiveRequest {
  /** 请求ID */
  requestId: string;
  
  /** 中断控制器 */
  abortController: AbortController;
  
  /** 请求开始时间 */
  startTime: number;
  
  /** 客户端信息（可选） */
  clientInfo?: {
    ip?: string;
    userAgent?: string;
  };
  
  /** 请求上下文（可选） */
  context?: {
    model?: string;
    messageCount?: number;
  };
}

/**
 * 中断请求体
 */
export interface InterruptRequest {
  /** 要中断的请求ID */
  requestId: string;
  
  /** 中断原因（可选） */
  reason?: string;
}

/**
 * 中断响应
 */
export interface InterruptResponse {
  /** 是否成功 */
  success: boolean;
  
  /** 消息 */
  message: string;
  
  /** 请求ID */
  requestId?: string;
  
  /** 是否已中断 */
  interrupted?: boolean;
  
  /** 部分生成的内容（如有） */
  partialContent?: string;
  
  /** 错误信息（如失败） */
  error?: string;
  
  /** 失败原因 */
  reason?: string;
}

/**
 * 请求清理统计
 */
export interface CleanupStats {
  /** 清理的请求数 */
  cleanedCount: number;
  
  /** 清理时间戳 */
  timestamp: number;
  
  /** 清理原因 */
  reason: 'timeout' | 'manual' | 'shutdown';
}

