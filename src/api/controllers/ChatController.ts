/**
 * ApexBridge (ABP-only) - 聊天控制器
 * 处理HTTP聊天请求
 */

import { Request, Response } from 'express';
import { ChatService } from '../../services/ChatService';
import { LLMManager as LLMClient } from '../../core/LLMManager';
import { InterruptRequest, InterruptResponse } from '../../types/request-abort';
import { Message } from '../../types';
import { logger } from '../../utils/logger';

/**
 * OpenAI 标准聊天参数白名单
 */
const STANDARD_CHAT_PARAMS = new Set([
  'model', 'temperature', 'max_tokens', 'top_p', 
  'frequency_penalty', 'presence_penalty', 
  'stop', 'n', 'stream', 'user', 'top_k'
]);

/**
 * 聊天选项接口
 */
interface ChatRequestOptions {
  provider?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  n?: number;
  stream?: boolean;
  user?: string;
  top_k?: number;
  agentId?: string;
  userId?: string;
  conversationId?: string; // 🆕 添加对话ID
  [key: string]: any;
}

export class ChatController {
  private chatService: ChatService;
  private llmClient: LLMClient | null;
  
  constructor(chatService: ChatService, llmClient: LLMClient | null) {
    this.chatService = chatService;
    this.llmClient = llmClient;
  }
  
  /**
   * POST /v1/chat/completions
   * OpenAI兼容的聊天API
   */
  async chatCompletions(req: Request, res: Response): Promise<void> {
    try {
      const { messages } = req.body;
      const body = req.body;
      
      // 提取标准参数
      const options: ChatRequestOptions = {
        provider: body.provider
      };
      
      // 只提取白名单中的参数
      for (const key of STANDARD_CHAT_PARAMS) {
        if (key in body) {
          options[key] = body[key];
        }
      }
      
      // 确保 stream 是布尔值
      options.stream = options.stream === true;

      // 注意：user 参数主要用于 OpenAI 标准，如果同时提供 user 和其他格式，优先使用其他格式
      options.userId = body.user_id
      
      // 🆕 提取 Conversation ID
      // 优先级：conversation_id > conversationId > apexMeta.conversationId
      options.conversationId = body.conversation_id
      
      // 🆕 提取 Agent ID（如果前端传入）
      // 优先级：agent_id > agentId > apexMeta.agentId
      options.agentId = body.agent_id

      // 🆕 提取 Self-Thinking 配置（多轮思考/ReAct模式）
      if (body.selfThinking) {
        try {
          // 验证 selfThinking 参数格式
          const selfThinking = body.selfThinking;

          // enabled 必须是 boolean
          if (typeof selfThinking.enabled !== 'boolean') {
            throw new Error('selfThinking.enabled must be a boolean');
          }

          // maxIterations 必须是正整数（如果提供）
          if (selfThinking.maxIterations !== undefined) {
            if (typeof selfThinking.maxIterations !== 'number' || selfThinking.maxIterations < 1) {
              throw new Error('selfThinking.maxIterations must be a positive integer');
            }
          }

          // includeThoughtsInResponse 必须是 boolean（如果提供）
          if (selfThinking.includeThoughtsInResponse !== undefined &&
              typeof selfThinking.includeThoughtsInResponse !== 'boolean') {
            throw new Error('selfThinking.includeThoughtsInResponse must be a boolean');
          }

          // enableStreamThoughts 必须是 boolean（如果提供）
          if (selfThinking.enableStreamThoughts !== undefined &&
              typeof selfThinking.enableStreamThoughts !== 'boolean') {
            throw new Error('selfThinking.enableStreamThoughts must be a boolean');
          }

          // tools 必须是数组（如果提供）
          if (selfThinking.tools !== undefined) {
            if (!Array.isArray(selfThinking.tools)) {
              throw new Error('selfThinking.tools must be an array');
            }
            // 验证每个 tool 的格式
            for (const tool of selfThinking.tools) {
              if (!tool.name || typeof tool.name !== 'string') {
                throw new Error('Each tool must have a name (string)');
              }
              if (!tool.description || typeof tool.description !== 'string') {
                throw new Error(`Tool ${tool.name} must have a description (string)`);
              }
            }
          }

          // 参数验证通过，提取配置
          options.selfThinking = {
            enabled: selfThinking.enabled,
            maxIterations: selfThinking.maxIterations ?? 5,
            includeThoughtsInResponse: selfThinking.includeThoughtsInResponse ?? true,
            systemPrompt: selfThinking.systemPrompt,
            additionalPrompts: selfThinking.additionalPrompts,
            tools: selfThinking.tools,
            enableStreamThoughts: selfThinking.enableStreamThoughts ?? false
          };

        } catch (validationError: any) {
          logger.error('❌ Invalid selfThinking parameters:', validationError);
          res.status(400).json({
            error: {
              message: validationError.message || 'Invalid selfThinking parameters',
              type: 'invalid_request'
            }
          });
          return;
        }
      }

      if (options.stream) {
        await this.handleStreamResponse(res, messages, options);
      } else {
        await this.handleNormalResponse(res, messages, options);
      }

    } catch (error: any) {
      logger.error('❌ Error in chatCompletions:', error);

      res.status(500).json({
        error: {
          message: error.message || 'Internal server error',
          type: 'server_error'
        }
      });
    }
  }

  /**
   * 处理流式响应
   */
  private async handleStreamResponse(
    res: Response,
    messages: Message[],
    options: ChatRequestOptions
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const responseId = `chatcmpl-${Date.now()}`;
    let chunkIndex = 0;

    // 检查是否启用思考过程流式输出
    const enableStreamThoughts = options.selfThinking?.enableStreamThoughts ?? false;

    try {
      for await (const chunk of this.chatService.streamMessage(messages, options)) {
        // 处理元数据标记（必须完全匹配，避免误拦截）
        if (chunk.startsWith('__META__:')) {
          const metaJson = chunk.substring(9);
          try {
            const metaData = JSON.parse(metaJson);
            
            if (metaData.type === 'requestId') {
              // 发送 requestId 元数据（非标准格式，仅用于自定义客户端）
              res.write(`data: ${JSON.stringify({ requestId: metaData.value })}\n\n`);
            } else if (metaData.type === 'interrupted') {
              // 修复：发送标准格式的中断通知，兼容标准 OpenAI SDK
              // 发送一个内容为 "Interrupted" 的标准 chunk，然后发送 [DONE]
              const interruptedChunk = {
                id: responseId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: options.model || 'gpt-4',
                choices: [{
                  index: 0,
                  delta: { content: '' },
                  finish_reason: 'stop'
                }]
              };
              res.write(`data: ${JSON.stringify(interruptedChunk)}\n\n`);
              // 立即发送 [DONE] 标记，结束流
              res.write('data: [DONE]\n\n');
              res.end();
              logger.info(`✅ Stream interrupted for request ${responseId}`);
              return; // 提前返回，不再处理后续 chunk
            }
            // 显式跳过，不执行下方逻辑
            continue;
          } catch (parseError) {
            // JSON 解析失败，记录警告但不中断流
            logger.warn('[ChatController] Failed to parse meta chunk:', metaJson);
            // 如果解析失败，不应该继续处理，避免泄露 META 标记
            continue;
          }
        }

        // 确保 chunk 不是 META 标记（双重保护）
        if (chunk.startsWith('__META__')) {
          logger.warn('[ChatController] Unhandled META chunk detected, skipping:', chunk.substring(0, 50));
          continue;
        }

        // 如果未启用思考流式输出，跳过思考过程标记
        if (!enableStreamThoughts && (
          chunk.startsWith('__THOUGHT') ||
          chunk.startsWith('__ACTION') ||
          chunk.startsWith('__OBSERVATION') ||
          chunk.startsWith('__ANSWER')
        )) {
          continue;
        }

        // 处理思考过程元数据（仅当启用时）
        if (chunk.startsWith('__THOUGHT_START__:')) {
          try {
            const data = JSON.parse(chunk.substring(18).trim());
            // 发送思考开始事件（自定义格式，用于前端展示）
            res.write(`event: thought_start\n`);
            res.write(`data: ${JSON.stringify({
              iteration: data.iteration,
              timestamp: data.timestamp
            })}\n\n`);
            chunkIndex++;
          } catch (e) {
            logger.warn('[ChatController] Failed to parse thought_start:', e);
          }
          continue;
        }
        
        if (chunk.startsWith('__THOUGHT__:')) {
          try {
            const data = JSON.parse(chunk.substring(12).trim());
            // 发送思考内容（标准 SSE 格式，带自定义字段）
            const sseData = {
              id: responseId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: options.model || 'gpt-4',
              choices: [{
                index: 0,
                delta: { 
                  content: `[思考 ${data.iteration}] ${data.content}`,
                  role: 'assistant'
                },
                finish_reason: null
              }],
              // 自定义字段：标识这是思考过程
              _type: 'thought',
              _iteration: data.iteration
            };
            res.write(`data: ${JSON.stringify(sseData)}\n\n`);
            chunkIndex++;
          } catch (e) {
            logger.warn('[ChatController] Failed to parse thought:', e);
          }
          continue;
        }
        
        if (chunk.startsWith('__THOUGHT_END__:')) {
          try {
            const data = JSON.parse(chunk.substring(16).trim());
            res.write(`event: thought_end\n`);
            res.write(`data: ${JSON.stringify({ iteration: data.iteration })}\n\n`);
            chunkIndex++;
          } catch (e) {
            logger.warn('[ChatController] Failed to parse thought_end:', e);
          }
          continue;
        }
        
        if (chunk.startsWith('__ACTION_START__:')) {
          try {
            const data = JSON.parse(chunk.substring(17).trim());
            // 发送工具执行开始事件
            res.write(`event: action_start\n`);
            res.write(`data: ${JSON.stringify({
              iteration: data.iteration,
              tool: data.tool,
              params: data.params
            })}\n\n`);
            chunkIndex++;
          } catch (e) {
            logger.warn('[ChatController] Failed to parse action_start:', e);
          }
          continue;
        }
        
        if (chunk.startsWith('__OBSERVATION__:')) {
          try {
            const data = JSON.parse(chunk.substring(16).trim());
            // 发送观察结果
            res.write(`event: observation\n`);
            res.write(`data: ${JSON.stringify({
              iteration: data.iteration,
              tool: data.tool,
              result: data.result,
              error: data.error
            })}\n\n`);
            chunkIndex++;
          } catch (e) {
            logger.warn('[ChatController] Failed to parse observation:', e);
          }
          continue;
        }
        
        if (chunk.startsWith('__ANSWER_START__:')) {
          // 发送答案开始标记
          res.write(`event: answer_start\n`);
          res.write(`data: {}\n\n`);
          chunkIndex++;
          continue;
        }
        
        if (chunk.startsWith('__ANSWER__:')) {
          try {
            const data = JSON.parse(chunk.substring(11).trim());
            // 发送最终答案内容（标准格式）
            const sseData = {
              id: responseId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: options.model || 'gpt-4',
              choices: [{
                index: 0,
                delta: { content: data.content },
                finish_reason: null
              }],
              _type: 'answer'
            };
            res.write(`data: ${JSON.stringify(sseData)}\n\n`);
            chunkIndex++;
          } catch (e) {
            logger.warn('[ChatController] Failed to parse answer:', e);
          }
          continue;
        }
        
        if (chunk.startsWith('__ANSWER_END__:')) {
          res.write(`event: answer_end\n`);
          res.write(`data: {}\n\n`);
          chunkIndex++;
          continue;
        }
        
        // 发送内容块（此时 chunk 必定是纯文本，回退模式）
        const sseData = {
          id: responseId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: options.model || 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: chunk },
            finish_reason: null
          }]
        };
        
        res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        chunkIndex++;
      }
      
      // 发送结束标记
      res.write('data: [DONE]\n\n');
      res.end();
      
      logger.info(`✅ Streamed ${chunkIndex} chunks for request ${responseId}`);
      
    } catch (streamError: any) {
      logger.error('❌ Error during streaming:', streamError);
      
      res.write(`data: ${JSON.stringify({
        error: {
          message: streamError.message,
          type: 'server_error'
        }
      })}\n\n`);
      res.end();
    }
  }

  /**
   * 处理普通响应
   */
  private async handleNormalResponse(
    res: Response, 
    messages: Message[], 
    options: ChatRequestOptions
  ): Promise<void> {
    const result = await this.chatService.processMessage(messages, options);
    
    // 修复：正确使用 usage 统计
    const usage = this.normalizeUsage(result.usage) || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    };
    
    const response = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: options.model || 'gpt-4',
      choices: [{
        index: 0,
        message: {
          role: 'assistant' as const,
          content: result.content
        },
        finish_reason: 'stop' as const
      }],
      usage: usage
    };
    
    res.json(response);
    logger.info('✅ Completed non-stream chat request');
  }

  /**
   * 规范化 Usage 统计
   * 支持多种格式的 usage 数据
   */
  private normalizeUsage(usage: any): { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null {
    if (!usage || typeof usage !== 'object') {
      return null;
    }

    const prompt =
      typeof usage.prompt_tokens === 'number'
        ? usage.prompt_tokens
        : typeof usage.promptTokens === 'number'
        ? usage.promptTokens
        : undefined;

    const completion =
      typeof usage.completion_tokens === 'number'
        ? usage.completion_tokens
        : typeof usage.completionTokens === 'number'
        ? usage.completionTokens
        : undefined;

    let total =
      typeof usage.total_tokens === 'number'
        ? usage.total_tokens
        : typeof usage.totalTokens === 'number'
        ? usage.totalTokens
        : undefined;

    // 如果 total 不存在，尝试计算
    if (typeof total !== 'number' && typeof prompt === 'number' && typeof completion === 'number') {
      total = prompt + completion;
    }

    // 验证所有字段都是数字
    if (
      typeof prompt !== 'number' ||
      typeof completion !== 'number' ||
      typeof total !== 'number'
    ) {
      return null;
    }

    return {
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: total
    };
  }
 
  /**
   * 获取 LLM 客户端（支持懒加载）
   * 与 ChatService 的懒加载策略保持一致
   */
  private async getLLMClient(): Promise<LLMClient> {
    if (this.llmClient) {
      return this.llmClient;
    }
    
    // 懒加载：如果构造函数传入的是 null，尝试动态加载
    try {
      const { LLMManager } = await import('../../core/LLMManager');
      const client = new LLMManager() as LLMClient;
      if (!client) {
        throw new Error('LLMClient not available. Please configure LLM providers in admin panel.');
      }
      // 缓存实例，避免重复创建
      this.llmClient = client;
      return client;
    } catch (error: any) {
      throw new Error(`Failed to initialize LLMClient: ${error.message || error}`);
    }
  }

  /**
   * GET /v1/models
   * 获取可用模型列表
   */
  async getModels(req: Request, res: Response): Promise<void> {
    try {
      // 优化：支持懒加载，与 ChatService 的策略保持一致
      const llmClient = await this.getLLMClient();
      const models = await llmClient.getAllModels();
      
      res.json({
        object: 'list',
        data: models.map(m => ({
          id: m.id,
          object: 'model',
          owned_by: m.provider,
          created: Math.floor(Date.now() / 1000)
        }))
      });
      
      logger.info(`✅ Returned ${models.length} models`);
      
    } catch (error: any) {
      logger.error('❌ Error in getModels:', error);
      
      // 区分懒加载失败和业务错误
      const statusCode = error.message?.includes('not available') || error.message?.includes('Failed to initialize') 
        ? 503 
        : 500;
      
      res.status(statusCode).json({
        error: {
          message: error.message || 'Failed to fetch models',
          type: statusCode === 503 ? 'service_unavailable' : 'server_error'
        }
      });
    }
  }
  
  /**
   * POST /v1/interrupt
   * 中断正在进行的请求
   */
  async interruptRequest(req: Request, res: Response): Promise<void> {
    try {
      const body: InterruptRequest = req.body;
      const { requestId } = body;
      
      // 验证参数
      if (!requestId || typeof requestId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Missing or invalid requestId'
        });
        return;
      }
      
      logger.info(`[ChatController] Interrupt request for: ${requestId}`);
      
      // 调用 ChatService 中断
      const interrupted = await this.chatService.interruptRequest(requestId);
      
      if (interrupted) {
        const response: InterruptResponse = {
          success: true,
          message: 'Request interrupted successfully',
          requestId: requestId,
          interrupted: true
        };
        
        logger.info(`✅ Request interrupted: ${requestId}`);
        res.json(response);
      } else {
        const response: InterruptResponse = {
          success: false,
          message: 'Request not found or already completed',
          requestId: requestId,
          reason: 'not_found'
        };
        
        logger.warn(`⚠️  Request not found for interrupt: ${requestId}`);
        res.status(404).json(response);
      }
      
    } catch (error: any) {
      logger.error('❌ Error in interruptRequest:', error);
      
      const response: InterruptResponse = {
        success: false,
        message: error.message || 'Failed to interrupt request',
        error: error.toString()
      };
      
      res.status(500).json(response);
    }
  }

  /**
   * DELETE /v1/chat/sessions/:conversationId
   * 删除会话（用户删除对话时调用）
   */
  async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = req.params.conversationId;
      
      if (!conversationId) {
        res.status(400).json({
          error: {
            message: 'conversationId is required',
            type: 'invalid_request'
          }
        });
        return;
      }
      
      await this.chatService.endSession(conversationId);
      
      res.json({
        success: true,
        message: 'Session deleted successfully'
      });
    } catch (error: any) {
      logger.error('❌ Error in deleteSession:', error);
      res.status(500).json({
        error: {
          message: error.message || 'Internal server error',
          type: 'server_error'
        }
      });
    }
  }

  /**
   * GET /v1/chat/sessions/:conversationId
   * 获取会话状态
   */
  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const conversationId = req.params.conversationId;
      
      if (!conversationId) {
        res.status(400).json({
          error: {
            message: 'conversationId is required',
            type: 'invalid_request'
          }
        });
        return;
      }
      
      const sessionState = await this.chatService.getSessionState(conversationId);
      
      if (!sessionState) {
        res.status(404).json({
          error: {
            message: 'Session not found',
            type: 'not_found'
          }
        });
        return;
      }
      
      res.json({
        success: true,
        data: sessionState
      });
    } catch (error: any) {
      logger.error('❌ Error in getSession:', error);
      res.status(500).json({
        error: {
          message: error.message || 'Internal server error',
          type: 'server_error'
        }
      });
    }
  }

  /**
   * GET /v1/chat/sessions/active
   * 获取会话列表（支持获取所有有对话历史的会话或时间范围内的活跃会话）
   */
  async getActiveSessions(req: Request, res: Response): Promise<void> {
    try {
      // 解析参数
      const cutoffTime = req.query.cutoffTime
        ? parseInt(req.query.cutoffTime as string)
        : undefined;

      // 获取ACE引擎（可能为null）
      const engine = this.chatService.getAceEngine();

      let conversationIds: string[];

      if (cutoffTime === -1) {
        // 获取所有有对话历史的会话
        conversationIds = await this.chatService.getAllConversationsWithHistory();
      } else {
        // 获取ACE引擎管理的活跃会话
        if (!engine) {
          res.status(503).json({
            error: {
              message: 'ACE Engine not initialized',
              type: 'service_unavailable'
            }
          });
          return;
        }

        const effectiveCutoffTime = cutoffTime ?? (Date.now() - 60 * 60 * 1000); // 默认1小时前
        conversationIds = await engine.getActiveSessions(effectiveCutoffTime);
      }

      // 获取会话详细信息（统一的ACE会话格式）
      const sessions = await Promise.all(
        conversationIds.map(async (sessionId) => {
          try {
            // 优先获取ACE会话状态
            const aceSession = engine ? await engine.getSessionState(sessionId).catch(() => null) : null;

            if (aceSession) {
              // 如果有ACE会话，直接返回
              return aceSession;
            } else if (cutoffTime === -1) {
              // 如果是获取所有会话且没有ACE会话，为对话历史创建基本的会话信息
              const messageCount = await this.chatService.getConversationMessageCount(sessionId);
              const lastMessage = await this.chatService.getConversationLastMessage(sessionId);

              return {
                sessionId,
                lastActivityAt: lastMessage?.created_at || 0,
                status: 'no_ace_session', // 标记为没有ACE会话
                activeGoals: [],
                reflectionCount: 0,
                lastReflectionTime: 0,
                lastReflectionDataHash: '',
                metadata: {
                  conversationId: sessionId,
                  messageCount,
                  lastMessage: lastMessage?.content?.substring(0, 100) || '',
                  source: 'conversation_history'
                }
              };
            }

            return null;
          } catch (error: any) {
            logger.warn(`[ChatController] Failed to get session state for ${sessionId}: ${error.message}`);
            return null;
          }
        })
      );

      // 统一的响应格式
      const response = {
        sessions: sessions.filter(s => s !== null),
        total: sessions.filter(s => s !== null).length,
        cutoffTime: cutoffTime ?? (Date.now() - 60 * 60 * 1000)
      };

      res.json(response);
    } catch (error: any) {
      logger.error('❌ Error in getActiveSessions:', error);
      res.status(500).json({
        error: {
          message: error.message || 'Internal server error',
          type: 'server_error'
        }
      });
    }
  }

  /**
   * GET /v1/chat/sessions/:conversationId/history
   * 获取会话历史（日志、轨迹等）
   */
  async getSessionHistory(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const { type = 'all', limit = '100' } = req.query;

      if (!conversationId) {
        res.status(400).json({
          error: {
            message: 'conversationId is required',
            type: 'invalid_request'
          }
        });
        return;
      }

      const engine = this.chatService.getAceEngine();
      if (!engine) {
        res.status(503).json({
          error: {
            message: 'ACE Engine not initialized',
            type: 'service_unavailable'
          }
        });
        return;
      }

      // 1. 先查内存映射
      let sessionId = this.chatService.getSessionIdByConversationId(conversationId);
      
      // 2. 如果映射不存在，尝试直接从 ACE Engine 查询（因为 sessionId = conversationId）
      if (!sessionId) {
        try {
          // 直接使用 conversationId 作为 sessionId 查询
          const session = await engine.getSessionState(conversationId);
          if (session && session.status === 'active') {
            // 找到会话，使用 conversationId 作为 sessionId
            sessionId = conversationId;
          } else {
            res.status(404).json({
              error: {
                message: 'Session not found',
                type: 'not_found'
              }
            });
            return;
          }
        } catch (error: any) {
          logger.debug(`[ChatController] Session ${conversationId} not found in ACE Engine: ${error.message}`);
          res.status(404).json({
            error: {
              message: 'Session not found',
              type: 'not_found'
            }
          });
          return;
        }
      }

      const history: any = {};
      const limitNum = parseInt(limit as string) || 100;

      // 获取会话状态
      if (type === 'all' || type === 'state') {
        history.sessionState = await engine.getSessionState(sessionId);
      }

      // 获取遥测日志
      if (type === 'all' || type === 'telemetry') {
        try {
          history.telemetry = await engine.getTelemetryBySession(sessionId, limitNum);
        } catch (error: any) {
          logger.warn(`[ChatController] Failed to get telemetry: ${error.message}`);
          history.telemetry = [];
        }
      }

      // 获取指令日志
      if (type === 'all' || type === 'directives') {
        try {
          history.directives = await engine.getDirectivesBySession(sessionId, limitNum);
        } catch (error: any) {
          logger.warn(`[ChatController] Failed to get directives: ${error.message}`);
          history.directives = [];
        }
      }

      res.json({
        success: true,
        data: history
      });
    } catch (error: any) {
      logger.error('❌ Error in getSessionHistory:', error);
      res.status(500).json({
        error: {
          message: error.message || 'Internal server error',
          type: 'server_error'
        }
      });
    }
  }

  /**
   * GET /v1/chat/sessions/:conversationId/messages
   * 获取对话消息历史
   */
  async getConversationMessages(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const { limit = '100', offset = '0' } = req.query;

      if (!conversationId) {
        res.status(400).json({
          error: {
            message: 'conversationId is required',
            type: 'invalid_request'
          }
        });
        return;
      }

      const messages = await this.chatService.getConversationHistory(
        conversationId,
        parseInt(limit as string) || 100,
        parseInt(offset as string) || 0
      );

      const total = await this.chatService.getConversationMessageCount(conversationId);

      res.json({
        success: true,
        data: {
          messages,
          total,
          limit: parseInt(limit as string) || 100,
          offset: parseInt(offset as string) || 0
        }
      });
    } catch (error: any) {
      logger.error('❌ Error in getConversationMessages:', error);
      res.status(500).json({
        error: {
          message: error.message || 'Internal server error',
          type: 'server_error'
        }
      });
    }
  }

  /**
   * POST /v1/chat/simple-stream
   * 简化版流式聊天接口（专为前端看板娘设计）
   * 只包含基本的LLM对话参数，不支持多轮思考和ACE
   */
  async simpleChatStream(req: Request, res: Response): Promise<void> {
    try {
      const { messages } = req.body;
      const body = req.body;

      // 验证必填参数
      if (!messages || !Array.isArray(messages)) {
        res.status(400).json({
          error: {
            message: 'messages is required and must be an array',
            type: 'validation_error'
          }
        });
        return;
      }

      // 只提取最基本的LLM参数
      const options: ChatRequestOptions = {
        provider: body.provider,
        model: body.model,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
        stream: true, // 强制流式输出
        user: body.user
      };

      // 简单的参数验证
      if (!options.model) {
        res.status(400).json({
          error: {
            message: 'model is required',
            type: 'validation_error'
          }
        });
        return;
      }

      // 调用流式响应处理
      await this.handleStreamResponse(res, messages, options);

    } catch (error: any) {
      logger.error('❌ Error in simpleChatStream:', error);

      // 如果响应头还没发送，发送错误响应
      if (!res.headersSent) {
        res.status(500).json({
          error: {
            message: error.message || 'Internal server error',
            type: 'server_error'
          }
        });
      }
    }
  }
}
