/**
 * ReAct Engine - 极简实现
 *
 * 设计原则：
 * 1. 仅用 AsyncGenerator，无事件队列和任务池
 * 2. 工具调用直接 await，天然背压
 * 3. 前端直接消费生成器事件
 */

import { logger } from '../../utils/logger';
import { Tool, ReActOptions, StreamEvent } from '../../types/react';

/**
 * ReAct 引擎
 */
export class ReActEngine {
  private tools: Map<string, Tool>;

  constructor(tools: Tool[] = []) {
    this.tools = new Map(tools.map(t => [t.name, t]));
    logger.info(`✅ ReActEngine initialized with ${tools.length} tools`);
  }

  /**
   * 执行 ReAct 对话（流式）
   *
   * 流程：
   * 1. 订阅 LLM SSE 流
   * 2. 遇到 reasoning_content → yield 思考事件
   * 3. 遇到 content → yield 回答事件
   * 4. 遇到 finish_reason === 'tool_calls' → 执行工具 → 回流 LLM
   * 5. 重复直到无工具调用
   */
  async *execute(
    messages: any[],
    llmClient: any,
    options: ReActOptions = {}
  ): AsyncGenerator<StreamEvent, string, void> {
    const maxIterations = options.maxIterations || 10;
    const timeout = options.timeout || 300000; // 5 分钟
    const enableThink = options.enableThink !== false;

    const startTime = Date.now();

    // 迭代次数控制
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      logger.debug(`🔄 ReAct iteration ${iteration + 1}/${maxIterations}`);

      // 检查超时
      if (Date.now() - startTime > timeout) {
        yield {
          type: 'error',
          data: { message: 'ReAct execution timeout' },
          timestamp: Date.now()
        };
        throw new Error('ReAct execution timeout');
      }

      try {
        // 步骤 1: 调用 LLM 并订阅 SSE 流
        const stream = llmClient.streamChat(messages, {
          tools: Array.from(this.tools.values()).map(t => ({
            type: 'function',
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters
            }
          })),
          enableThink // 启用思考输出
        });

        let accumulatedContent = '';
        let reasoningContent = '';
        let toolCalls: any[] = [];

        // 步骤 2: 处理 SSE 流
        for await (const chunk of stream) {
          // 解析思考过程 (reasoning_content)
          if (chunk.reasoning_content) {
            reasoningContent += chunk.reasoning_content;

            if (enableThink) {
              yield {
                type: 'reasoning',
                data: { content: chunk.reasoning_content },
                timestamp: Date.now()
              };
            }
          }

          // 解析回答内容
          if (chunk.content) {
            accumulatedContent += chunk.content;

            yield {
              type: 'content',
              data: { content: chunk.content },
              timestamp: Date.now()
            };
          }

          // 累积工具调用（SSE 会分 chunk 传输 tool_calls）
          if (chunk.tool_calls) {
            toolCalls = this.mergeToolCalls(toolCalls, chunk.tool_calls);
          }
        }

        // 步骤 3: 处理工具调用（仅在 finish_reason === 'tool_calls' 时）
        if (toolCalls.length > 0) {
          logger.info(`🔧 Processing ${toolCalls.length} tool calls`);

          // 为每个工具调用执行
          for (const toolCall of toolCalls) {
            const toolName = toolCall.function.name;
            const tool = this.tools.get(toolName);

            if (!tool) {
              logger.error(`❌ Tool not found: ${toolName}`);
              yield {
                type: 'error',
                data: { message: `Tool not found: ${toolName}` },
                timestamp: Date.now()
              };
              continue;
            }

            // 步骤 3.1: 开始执行工具
            yield {
              type: 'tool_start',
              data: {
                toolName,
                args: toolCall.function.arguments
              },
              timestamp: Date.now()
            };

            try {
              // 步骤 3.2: 同步执行工具（直接 await，自然背压）
              const args = JSON.parse(toolCall.function.arguments);
              logger.info(`🔧 Executing tool: ${toolName}`, args);

              const result = await tool.execute(args);

              logger.info(`✅ Tool executed: ${toolName}`, { result });

              // 步骤 3.3: 结果回流（添加到 messages）
              messages.push({
                role: 'assistant',
                tool_calls: [toolCall]
              });

              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: JSON.stringify(result)
              });

              // 通知前端工具执行完成
              yield {
                type: 'tool_end',
                data: { toolName, result },
                timestamp: Date.now()
              };

              // 步骤 3.4: 立即继续下一轮 LLM 调用
              // 递归调用，形成 ReAct 循环
              yield* this.execute(messages, llmClient, options);

            } catch (error) {
              logger.error(`❌ Tool execution failed: ${toolName}`, error);

              const errorMessage = error instanceof Error ? error.message : String(error);

              // 错误回流
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: JSON.stringify({ error: errorMessage })
              });

              yield {
                type: 'error',
                data: {
                  message: `Tool ${toolName} failed: ${errorMessage}`
                },
                timestamp: Date.now()
              };

              // 继续执行（不中断整个流程）
              yield* this.execute(messages, llmClient, options);
            }
          }

          // 工具调用处理完成，跳过本次返回值
          continue;
        }

        // 步骤 4: 无工具调用，返回最终结果
        yield {
          type: 'done',
          data: null,
          timestamp: Date.now()
        };

        return accumulatedContent;

      } catch (error) {
        logger.error('❌ ReAct iteration error:', error);

        const errorMessage = error instanceof Error ? error.message : String(error);

        yield {
          type: 'error',
          data: { message: errorMessage },
          timestamp: Date.now()
        };

        throw error;
      }
    }

    // 达到最大迭代次数
    yield {
      type: 'error',
      data: { message: 'Max iterations reached' },
      timestamp: Date.now()
    };

    throw new Error('Max iterations reached');
  }

  /**
   * 合并工具调用（SSE 分片传输时需要累积）
   */
  private mergeToolCalls(existing: any[], newCalls: any[]): any[] {
    const merged = [...existing];

    for (const newCall of newCalls) {
      const index = newCall.index;

      if (!merged[index]) {
        merged[index] = newCall;
      } else {
        // 合并 function.arguments（累积 JSON 字符串）
        if (newCall.function?.arguments) {
          merged[index].function.arguments += newCall.function.arguments;
        }
      }
    }

    return merged;
  }
}
