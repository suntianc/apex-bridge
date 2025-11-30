/**
 * ReActStrategy - ReAct聊天处理策略
 * 实现自我思考循环，支持工具调用和流式输出
 */

import type { Message, ChatOptions } from '../types';
import type { ChatStrategy, ChatResult } from './ChatStrategy';
import type { LLMManager } from '../core/LLMManager';
import type { VariableResolver } from '../services/VariableResolver';
import type { AceIntegrator } from '../services/AceIntegrator';
import type { ConversationHistoryService } from '../services/ConversationHistoryService';
import { ReActEngine } from '../core/stream-orchestrator/ReActEngine';
import { LLMManagerAdapter } from '../core/stream-orchestrator/LLMAdapter';
import { SkillExecutor } from '../core/skills/SkillExecutor';
import type { Tool } from '../core/stream-orchestrator/types';
import { logger } from '../utils/logger';

export class ReActStrategy implements ChatStrategy {
  constructor(
    private llmManager: LLMManager,
    private variableResolver: VariableResolver,
    private aceIntegrator: AceIntegrator,
    private historyService: ConversationHistoryService
  ) {}

  getName(): string {
    return 'ReActStrategy';
  }

  /**
   * 检查是否支持该选项（需要selfThinking.enabled）
   */
  supports(options: ChatOptions): boolean {
    return !!options.selfThinking?.enabled;
  }

  /**
   * 执行ReAct聊天处理
   */
  async execute(messages: Message[], options: ChatOptions): Promise<ChatResult> {
    const startTime = Date.now();
    const includeThoughtsInResponse = options.selfThinking?.includeThoughtsInResponse ?? true;

    logger.debug(`[${this.getName()}] Starting ReAct execution`);

    // 1. 创建SkillExecutor并注册工具
    const skillExecutor = new SkillExecutor();
    this.registerDefaultTools(skillExecutor);

    // 注册用户自定义工具
    if (options.selfThinking?.tools) {
      options.selfThinking.tools.forEach(toolDef => {
        const tool: Tool = {
          name: toolDef.name,
          description: toolDef.description,
          parameters: toolDef.parameters,
          execute: async (args) => {
            return this.executeCustomTool(toolDef.name, args);
          }
        };
        skillExecutor.registerSkill(tool);
      });
    }

    // 2. 变量替换
    messages = await this.variableResolver.resolve(messages);

    // 3. 初始化 ReAct 引擎
    const reactEngine = new ReActEngine({
      maxIterations: options.selfThinking?.maxIterations ?? 5,
      enableThinking: options.selfThinking?.enableStreamThoughts ?? true,
      maxConcurrentTools: 3,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.max_tokens
    });

    // 4. 执行 ReAct 循环
    const thinkingProcess: string[] = [];
    let finalContent = '';
    let iterations = 0;

    try {
      const llmClient = new LLMManagerAdapter(this.llmManager);
      const stream = reactEngine.execute(messages, llmClient, {});

      for await (const event of stream) {
        iterations = event.iteration;

        if (event.type === 'reasoning') {
          thinkingProcess.push(event.data);
        } else if (event.type === 'content') {
          finalContent += event.data;
        }
      }

      logger.debug(`[${this.getName()}] ReAct completed in ${iterations} iterations`);

      // 5. ACE Integration: 保存轨迹
      if (options.sessionId && this.aceIntegrator.isEnabled()) {
        await this.aceIntegrator.saveTrajectory({
          requestId: options.requestId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          sessionId: options.sessionId,
          messages: messages,
          finalContent: finalContent,
          thinkingProcess: thinkingProcess,
          iterations: iterations,
          isReAct: true
        });

        // 更新会话活动时间
        this.aceIntegrator.updateSessionActivity(options.sessionId).catch(err => {
          logger.warn(`[${this.getName()}] Failed to update session activity: ${err.message}`);
        });
      }

      // 6. 保存对话消息历史
      const conversationId = options.conversationId as string | undefined;
      if (conversationId) {
        await this.saveReActConversationHistory(conversationId, messages, finalContent, thinkingProcess);
      }

      // 返回结果
      return {
        content: finalContent,
        iterations,
        thinkingProcess: includeThoughtsInResponse ? thinkingProcess.join('\n') : undefined,
        usage: undefined // TODO: 从LLMClient获取usage
      };

    } catch (error) {
      logger.error(`[${this.getName()}] ReAct execution failed: ${error}`);
      throw error;
    }
  }

  /**
   * 创建流式迭代器（ReAct流式版本）
   */
  async *stream(
    messages: Message[],
    options: ChatOptions,
    abortSignal?: AbortSignal
  ): AsyncIterableIterator<any> {
    logger.debug(`[${this.getName()}] Streaming ReAct execution`);

    // 创建SkillExecutor并注册工具
    const skillExecutor = new SkillExecutor();
    this.registerDefaultTools(skillExecutor);

    // 注册用户自定义工具
    if (options.selfThinking?.tools) {
      options.selfThinking.tools.forEach(toolDef => {
        const tool: Tool = {
          name: toolDef.name,
          description: toolDef.description,
          parameters: toolDef.parameters,
          execute: async (args) => {
            return this.executeCustomTool(toolDef.name, args);
          }
        };
        skillExecutor.registerSkill(tool);
      });
    }

    // 变量替换
    messages = await this.variableResolver.resolve(messages);

    // 初始化 ReAct 引擎
    const reactEngine = new ReActEngine({
      maxIterations: options.selfThinking?.maxIterations ?? 5,
      enableThinking: options.selfThinking?.enableStreamThoughts ?? true,
      maxConcurrentTools: 3,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.max_tokens
    });

    const llmClient = new LLMManagerAdapter(this.llmManager);
    const stream = reactEngine.execute(messages, llmClient, {});

    // 收集用于历史记录的数据
    const collectedThinking: string[] = [];
    let collectedContent = '';

    for await (const event of stream) {
      // 检查中断
      if (abortSignal?.aborted) {
        logger.debug(`[${this.getName()}] ReAct stream aborted`);
        return;
      }

      // 流式输出事件
      if (options.selfThinking?.enableStreamThoughts && event.type === 'reasoning') {
        yield `__THOUGHT__:${JSON.stringify({ iteration: event.iteration, content: event.data })}`;
        collectedThinking.push(event.data);
      } else if (event.type === 'content') {
        yield event.data;
        collectedContent += event.data;
      }
    }

    // 保存对话历史（在流结束后）
    if (options.conversationId) {
      await this.saveReActConversationHistory(
        options.conversationId,
        messages,
        collectedContent,
        collectedThinking
      );
    }
  }

  /**
   * 保存ReAct对话历史（包含思考过程）
   */
  private async saveReActConversationHistory(
    conversationId: string,
    messages: Message[],
    finalContent: string,
    thinkingProcess: string[]
  ): Promise<void> {
    try {
      const count = await this.historyService.getMessageCount(conversationId);
      const messagesToSave: Message[] = [];

      if (count === 0) {
        messagesToSave.push(...messages.filter(m => m.role !== 'assistant'));
      } else {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role !== 'assistant') {
          messagesToSave.push(lastMessage);
        }
      }

      // 构建包含思考过程的AI回复
      let assistantContent = finalContent;
      if (thinkingProcess.length > 0) {
        // 解析thinkingProcess中的JSON字符串，提取reasoning_content
        const extractedThinking: string[] = [];
        for (const chunk of thinkingProcess) {
          try {
            const cleaned = chunk.replace(/^data:\s*/, '').trim();
            if (cleaned && cleaned !== '[DONE]') {
              // 检查是否是多个JSON对象拼接
              if (cleaned.includes('}{')) {
                const jsonObjects = cleaned.split(/\}\{/);
                for (let i = 0; i < jsonObjects.length; i++) {
                  let jsonStr = jsonObjects[i];
                  if (i > 0) jsonStr = '{' + jsonStr;
                  if (i < jsonObjects.length - 1) jsonStr = jsonStr + '}';
                  if (jsonStr) {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.reasoning_content) {
                      extractedThinking.push(parsed.reasoning_content);
                    }
                  }
                }
              } else {
                const parsed = JSON.parse(cleaned);
                if (parsed.reasoning_content) {
                  extractedThinking.push(parsed.reasoning_content);
                }
              }
            }
          } catch (error) {
            extractedThinking.push(chunk);
          }
        }

        const thinkingContent = extractedThinking.join('');
        assistantContent = `<thinking>${thinkingContent}</thinking> ${finalContent}`;
      }

      messagesToSave.push({
        role: 'assistant',
        content: assistantContent
      });

      await this.historyService.saveMessages(conversationId, messagesToSave);
      logger.debug(`[${this.getName()}] Saved ${messagesToSave.length} messages to history`);
    } catch (err: any) {
      logger.warn(`[${this.getName()}] Failed to save conversation history: ${err.message}`);
    }
  }

  /**
   * 注册默认工具
   */
  private registerDefaultTools(skillExecutor: SkillExecutor): void {
    // 这里应该由ChatService传递默认工具，避免重复定义
    // 暂时为空，由ChatService在初始化时传递
  }

  /**
   * 执行自定义工具
   */
  private async executeCustomTool(toolName: string, params: any): Promise<any> {
    // 工具执行委托给ChatService或Skill系统
    // 暂时返回模拟结果
    logger.info(`[${this.getName()}] Executing custom tool: ${toolName}`, params);

    switch (toolName) {
      case 'custom_business_logic':
        return { result: 'Custom business result', params };
      default:
        throw new Error(`[${this.getName()}] Unknown tool: ${toolName}`);
    }
  }
}
