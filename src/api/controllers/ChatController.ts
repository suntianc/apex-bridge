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
      
      // 支持 agent_id 参数（人格切换）
      if (body.agent_id) {
        options.agentId = body.agent_id;
      }
      
      // 确保 stream 是布尔值
      options.stream = options.stream === true;

      // 优化的 User ID 提取逻辑
      options.userId = body.user_id ?? body.userId ?? body.user ?? body.apexMeta?.userId;

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
        
        // 发送内容块（此时 chunk 必定是纯文本）
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
}
