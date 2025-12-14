/**
 * ReAct 引擎类型定义
 * 极简设计：纯 AsyncGenerator，无事件队列和任务池
 */

/**
 * 工具接口
 * 符合 OpenAI Tool 规范
 */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: any) => Promise<any>;
}

/**
 * ReAct 配置选项
 */
export interface ReActOptions {
  /** 最大迭代次数（默认 50） */
  maxIterations?: number;

  /** 总超时时间（毫秒，默认 5 分钟） */
  timeout?: number;

  /** 是否启用思考流式输出（默认 true） */
  enableThink?: boolean;
}

/**
 * 流式事件类型
 */
export interface StreamEvent {
  type: 'reasoning' | 'content' | 'tool_start' | 'tool_end' | 'error' | 'done';
  data: any;
  timestamp: number;
}
