/**
 * VCP IntelliCore (智脑) - 聊天控制器
 * 处理HTTP聊天请求
 */

import { Request, Response } from 'express';
import { ChatService } from '../../services/ChatService';
import { LLMClient } from '../../core/LLMClient';
import { InterruptRequest, InterruptResponse } from '../../types/request-abort';
import { logger } from '../../utils/logger';
import { ConversationRequestPayload } from '../../types';
import { ConversationRouter, ConversationRoutingError } from '../../core/conversation/ConversationRouter';

export class ChatController {
  private chatService: ChatService;
  private llmClient: LLMClient | null = null; // 改为可选，支持懒加载
  private readonly conversationRouter: ConversationRouter;
  
  constructor(chatService: ChatService, llmClient: LLMClient | null, conversationRouter: ConversationRouter) {
    this.chatService = chatService;
    this.llmClient = llmClient;
    this.conversationRouter = conversationRouter;
  }
  
  /**
   * POST /v1/chat/completions
   * OpenAI兼容的聊天API
   */
  async chatCompletions(req: Request, res: Response): Promise<void> {
    try {
      const { messages } = req.body;
      
      // 注意：请求验证已由验证中间件处理，这里只需要提取参数
      // 🔐 白名单机制：只提取OpenAI标准参数
      const STANDARD_CHAT_PARAMS = new Set([
        'model', 'temperature', 'max_tokens', 'top_p', 
        'frequency_penalty', 'presence_penalty', 
        'stop', 'n', 'stream', 'user', 'top_k'
      ]);
      
      const options: any = {
        provider: req.body.provider // 内部路由参数
      };
      
      // 只提取白名单中的参数
      for (const [key, value] of Object.entries(req.body)) {
        if (STANDARD_CHAT_PARAMS.has(key)) {
          options[key] = value;
        }
      }
      
      // 🆕 支持agent_id参数（人格切换）
      if (req.body.agent_id) {
        options.agentId = req.body.agent_id;
      }
      
      // 确保 stream 是布尔值（验证中间件已经确保它是布尔值或undefined）
      options.stream = options.stream === true;

      const requestUserId =
        typeof req.body.user_id === 'string'
          ? req.body.user_id
          : typeof req.body.userId === 'string'
          ? req.body.userId
          : typeof req.body.user === 'string'
          ? req.body.user
          : typeof req.body?.apexMeta?.userId === 'string'
          ? req.body.apexMeta.userId
          : undefined;
      if (requestUserId) {
        options.userId = requestUserId;
      }

      const conversationPayload: ConversationRequestPayload = {
        messages,
        options,
        apexMeta: req.body?.apexMeta
      };

      let route;
      try {
        route = this.conversationRouter.resolveRoute(conversationPayload);
      } catch (error) {
        if (error instanceof ConversationRoutingError) {
          res.status(error.statusCode).json({
            error: {
              message: error.message,
              type: 'conversation_routing_error'
            }
          });
          return;
        }
        throw error;
      }
      const primaryTarget = route.primaryTarget;
      options.agentId = primaryTarget.personaId ?? options.agentId;

      if (primaryTarget.type === 'companion' || primaryTarget.type === 'worker') {
        if (options.stream) {
          logger.warn(`[ChatController] Stream mode requested for ${primaryTarget.type} node; falling back to non-stream response`);
          options.stream = false;
        }
        try {
          const nodeConversation = await this.chatService.processNodeConversation(
            messages,
            options,
            route
          );

          const responseModel =
            options.model ||
            (primaryTarget.type === 'companion' ? 'companion-proxy' : 'worker-proxy');

          const response: any = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: responseModel,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: nodeConversation.content ?? ''
                },
                finish_reason: 'stop'
              }
            ],
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0
            },
            node_result: nodeConversation.rawResult ?? null,
            partial_outputs: nodeConversation.partialOutputs ?? []
          };

          const normalizedUsage = this.normalizeUsage(nodeConversation.usage);
          if (normalizedUsage) {
            response.usage = normalizedUsage;
          }

          if (nodeConversation.delegations && nodeConversation.delegations.length > 0) {
            response.delegations = nodeConversation.delegations;
          }

          res.json(response);

          if (nodeConversation.content) {
            this.conversationRouter.recordAssistantMessage(route.conversationId, {
              role: 'assistant',
              content: nodeConversation.content,
              personaId: primaryTarget.personaId,
              memberId: primaryTarget.memberId
            });
          }
        } catch (error: any) {
          logger.error('❌ Node conversation failed:', error);
          res.status(502).json({
            error: {
              message: error?.message || 'Node conversation failed',
              type: 'node_conversation_failed'
            }
          });
        }
        return;
      }

      if (primaryTarget.type !== 'hub') {
        res.status(501).json({
          error: {
            message: `Personas of type "${primaryTarget.type}" are not yet supported in the current routing phase.`,
            type: 'unsupported_target'
          }
        });
        return;
      }
      
      if (options.stream) {
        // 流式响应
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // 禁用Nginx缓冲
        
        const responseId = `chatcmpl-${Date.now()}`;
        let chunkIndex = 0;
        let aggregatedContent = '';
        
        try {
          for await (const chunk of this.chatService.streamMessage(messages, options, route)) {
            // 🆕 处理元数据标记（不包装为delta，直接发送）
            if (chunk.startsWith('__META__:')) {
              const metaData = JSON.parse(chunk.substring(9));
              
              if (metaData.type === 'requestId') {
                // 发送 requestId 元数据
                res.write(`data: ${JSON.stringify({requestId: metaData.value})}\n\n`);
                continue;
              } else if (metaData.type === 'interrupted') {
                // 发送中断标记
                res.write(`data: [INTERRUPTED]\n\n`);
                continue;
              }
            }
            
            // 普通内容：包装为 delta
            if (!chunk.startsWith('__META__')) {
              aggregatedContent += chunk;
            }
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
          if (aggregatedContent.trim().length > 0) {
            this.conversationRouter.recordAssistantMessage(route.conversationId, {
              role: 'assistant',
              content: aggregatedContent,
              personaId: primaryTarget.personaId,
              memberId: primaryTarget.memberId
            });
          }
          
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
        
      } else {
        // 非流式响应
        const result = await this.chatService.processMessage(messages, options, route);
        
        const response = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: options.model || 'gpt-4',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: result.content
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        };
        
        res.json(response);
        logger.info('✅ Completed non-stream chat request');
        if (result?.content) {
          this.conversationRouter.recordAssistantMessage(route.conversationId, {
            role: 'assistant',
            content: result.content,
            personaId: primaryTarget.personaId,
            memberId: primaryTarget.memberId
          });
        }
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

    if (typeof total !== 'number' && typeof prompt === 'number' && typeof completion === 'number') {
      total = prompt + completion;
    }

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
   * GET /v1/models
   * 获取可用模型列表
   */
  async getModels(req: Request, res: Response): Promise<void> {
    // 懒加载LLMClient（线程安全）
    if (!this.llmClient) {
      const { RuntimeConfigService } = require('../../services/RuntimeConfigService');
      const runtimeConfig = RuntimeConfigService.getInstance();
      this.llmClient = await runtimeConfig.getLLMClient();
    }
    
    if (!this.llmClient) {
      res.status(503).json({
        error: {
          message: 'LLMClient not available. Please configure LLM providers in admin panel.',
          type: 'service_unavailable'
        }
      });
      return;
    }
    try {
      const models = await this.llmClient.getAllModels();
      
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
      
      res.status(500).json({
        error: {
          message: error.message || 'Failed to fetch models',
          type: 'server_error'
        }
      });
    }
  }
  
  /**
   * 🆕 POST /v1/interrupt
   * 中断正在进行的请求
   */
  async interruptRequest(req: Request, res: Response): Promise<void> {
    try {
      const body: InterruptRequest = req.body;
      const { requestId, reason } = body;
      
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
        // 成功中断
        const response: InterruptResponse = {
          success: true,
          message: 'Request interrupted successfully',
          requestId: requestId,
          interrupted: true
        };
        
        logger.info(`✅ Request interrupted: ${requestId}`);
        res.json(response);
      } else {
        // 请求不存在或已完成
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

