/**
 * ReAct Engine - 基于提示工程的客户端路由 Agent
 * 
 * 实现纯文本协议的思考-行动循环，不依赖 Function Calling API
 */

import { Message, ChatOptions } from '../types';
import { logger } from '../utils/logger';

export interface Tool {
  name: string;
  description: string;
  parameters: { [key: string]: any };
  execute: (params: any) => Promise<any>;
}

/**
 * 流式 XML 解析事件
 */
interface ParseEvent {
  type: 'THOUGHT_START' | 'THOUGHT_CONTENT' | 'THOUGHT_END'
  | 'ACTION_START' | 'ACTION_CONTENT' | 'ACTION_END'
  | 'ANSWER_START' | 'ANSWER_CONTENT' | 'ANSWER_END'
  | 'RAW_CONTENT';
  content?: string;
  actionName?: string;
  actionParams?: any;
}

/**
 * 流式 XML 解析器
 * 
 * 处理流式文本块并识别 XML 结构（<thought>, <action>, <answer>）
 * 支持跨 Chunk 的标签切分（如 Chunk1: "<tho", Chunk2: "ught>"）
 */
class StreamXmlParser {
  private buffer: string = '';
  private currentTag: string | null = null;
  private currentContent: string = '';
  private actionName: string | null = null;

  /**
   * 追加新的文本块并返回解析事件
   */
  *append(chunk: string): Generator<ParseEvent> {
    this.buffer += chunk;

    while (this.buffer.length > 0) {
      // 如果当前在标签内，继续收集内容
      if (this.currentTag) {
        const closingTag = `</${this.currentTag}>`;
        const closeIndex = this.buffer.indexOf(closingTag);

        if (closeIndex !== -1) {
          // 找到闭合标签
          const content = this.buffer.substring(0, closeIndex);
          this.currentContent += content;
          this.buffer = this.buffer.substring(closeIndex + closingTag.length);

          // 生成结束事件
          if (this.currentTag === 'thought') {
            yield { type: 'THOUGHT_END' };
          } else if (this.currentTag === 'action') {
            // 解析 action 参数
            let params = {};
            try {
              params = JSON.parse(this.currentContent.trim());
            } catch (e) {
              logger.warn('[StreamXmlParser] Invalid action JSON, using raw content');
              params = { raw: this.currentContent.trim() };
            }
            yield {
              type: 'ACTION_END',
              actionName: this.actionName || 'unknown',
              actionParams: params
            };
            this.actionName = null;
          } else if (this.currentTag === 'answer') {
            yield { type: 'ANSWER_END' };
          }

          this.currentTag = null;
          this.currentContent = '';
        } else {
          // 未找到闭合标签，先 yield 当前内容
          if (this.buffer.length > 0) {
            const contentToYield = this.buffer;
            this.currentContent += contentToYield;
            this.buffer = '';

            // Yield 内容增量
            if (this.currentTag === 'thought') {
              yield { type: 'THOUGHT_CONTENT', content: contentToYield };
            } else if (this.currentTag === 'answer') {
              yield { type: 'ANSWER_CONTENT', content: contentToYield };
            } else if (this.currentTag === 'action') {
              // action 内容不实时 yield，等待完整解析
              yield { type: 'ACTION_CONTENT', content: contentToYield };
            }
          }
          break; // 等待更多数据
        }
      } else {
        // 查找开始标签
        const thoughtMatch = this.buffer.match(/<thought>/);
        const actionMatch = this.buffer.match(/<action\s+name="([^"]+)">/);
        const answerMatch = this.buffer.match(/<answer>/);

        let matchIndex = -1;
        let matchLength = 0;
        let matchedTag: string | null = null;

        if (thoughtMatch && (matchIndex === -1 || thoughtMatch.index! < matchIndex)) {
          matchIndex = thoughtMatch.index!;
          matchLength = thoughtMatch[0].length;
          matchedTag = 'thought';
        }

        if (actionMatch && (matchIndex === -1 || actionMatch.index! < matchIndex)) {
          matchIndex = actionMatch.index!;
          matchLength = actionMatch[0].length;
          matchedTag = 'action';
          this.actionName = actionMatch[1];
        }

        if (answerMatch && (matchIndex === -1 || answerMatch.index! < matchIndex)) {
          matchIndex = answerMatch.index!;
          matchLength = answerMatch[0].length;
          matchedTag = 'answer';
        }

        if (matchedTag) {
          // 找到开始标签
          // 先 yield 标签前的原始内容
          if (matchIndex > 0) {
            const rawContent = this.buffer.substring(0, matchIndex);
            if (rawContent.trim()) {
              yield { type: 'RAW_CONTENT', content: rawContent };
            }
          }

          this.buffer = this.buffer.substring(matchIndex + matchLength);
          this.currentTag = matchedTag;
          this.currentContent = '';

          // 生成开始事件
          if (matchedTag === 'thought') {
            yield { type: 'THOUGHT_START' };
          } else if (matchedTag === 'action') {
            yield { type: 'ACTION_START', actionName: this.actionName || 'unknown' };
          } else if (matchedTag === 'answer') {
            yield { type: 'ANSWER_START' };
          }
        } else {
          // 没有找到标签，可能是不完整的标签（如 "<tho"）
          // 保留最后几字符以防跨 Chunk 切分
          const keepLength = 20; // 保留足够长度以识别 `<action name="xxx">`
          if (this.buffer.length > keepLength) {
            const rawContent = this.buffer.substring(0, this.buffer.length - keepLength);
            if (rawContent.trim()) {
              yield { type: 'RAW_CONTENT', content: rawContent };
            }
            this.buffer = this.buffer.substring(this.buffer.length - keepLength);
          }
          break; // 等待更多数据
        }
      }
    }
  }
  /**
   * 完成解析，返回剩余内容
   */
  *finish(): Generator<ParseEvent> {
    if (this.buffer.trim()) {
      yield { type: 'RAW_CONTENT', content: this.buffer };
    }
    this.buffer = '';
  }
}

export interface ReActOptions {
  systemPrompt?: string;           // 基础系统提示词
  additionalPrompts?: string[];    // 额外注入的提示词段落
  tools?: Tool[];                  // 可用工具列表
  maxIterations?: number;
  timeout?: number;
  enableStreamThoughts?: boolean;   // 是否流式输出思考过程
  onThought?: (thought: string, iteration: number) => void; // 思考过程回调
}

export interface ReActResult {
  content: string;
  thinkingProcess: string[];
  iterations: number;
  finalAnswer?: string;
  usage?: any;
}

export class ReActEngine {
  private tools: Map<string, Tool> = new Map();

  constructor(tools: Tool[] = []) {
    tools.forEach(tool => this.registerTool(tool));
  }

  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  /**
   * 执行 ReAct 循环
   */
  async execute(
    userQuery: string,
    llmClient: any,
    options: ReActOptions = {}
  ): Promise<ReActResult> {
    const startTime = Date.now();
    const maxIterations = options.maxIterations || 5;
    const timeout = options.timeout || 300000; // 5分钟

    // 构建系统提示词
    const systemPrompt = this.buildSystemPrompt(options);

    // 初始化消息历史
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery }
    ];

    let iteration = 0;
    const thinkingProcess: string[] = [];
    let finalAnswer: string | undefined;
    let lastUsage: any = undefined;

    while (iteration < maxIterations) {
      iteration++;

      // 检查超时
      if (Date.now() - startTime > timeout) {
        thinkingProcess.push('[系统警告] 达到最大超时时间，停止循环');
        logger.warn(`⚠️ ReAct loop timeout (${timeout}ms) reached`);
        break;
      }

      logger.debug(`🔄 [ReAct Loop Iteration ${iteration}/${maxIterations}]`);

      // 调用 LLM
      const response = await llmClient.chat(messages, { temperature: 0 });
      const aiContent = response.choices[0]?.message?.content || '';
      lastUsage = response.usage;

      logger.debug(`📝 LLM Response: ${aiContent.substring(0, 200)}...`);

      // 解析输出
      const parsed = this.parseOutput(aiContent);

      // 记录思考过程
      if (parsed.thought) {
        const thoughtText = `[思考 ${iteration}] ${parsed.thought}`;
        thinkingProcess.push(thoughtText);

        // 如果启用流式输出，调用回调
        if (options.enableStreamThoughts && options.onThought) {
          options.onThought(parsed.thought, iteration);
        }

        logger.info(`🧠 ${thoughtText}`);
      }

      // 更新消息历史
      messages.push({ role: 'assistant', content: aiContent });

      // 检查是否完成
      if (parsed.isFinal) {
        finalAnswer = parsed.answer;
        logger.info(`✅ ReAct loop completed with final answer`);
        break;
      }

      // 执行工具调用
      if (parsed.action) {
        try {
          const observation = await this.executeTool(parsed.action.name, parsed.action.params);
          const observationText = `工具 ${parsed.action.name} 返回: ${observation}`;
          thinkingProcess.push(`[观察] ${observationText}`);

          logger.debug(`👀 [Observation]: ${observationText.substring(0, 100)}...`);

          // 添加观察结果到消息历史
          messages.push({
            role: 'user',
            content: `[系统观察] 工具 '${parsed.action.name}' 返回: ${observation}`
          });
        } catch (error: any) {
          const errorMsg = `工具 ${parsed.action.name} 执行失败: ${error.message || error}`;
          thinkingProcess.push(`[系统警告] ${errorMsg}`);
          logger.error(`❌ Tool execution failed: ${errorMsg}`);
          messages.push({
            role: 'user',
            content: `[系统警告] 工具 '${parsed.action.name}' 执行失败: ${error.message || error}`
          });
        }
      } else {
        // 没有行动，添加推动继续的提示
        messages.push({
          role: 'user',
          content: '请继续分析，或给出最终结论。如果任务已完成，请明确说明。'
        });
      }

      // 清理：保持上下文大小可控
      if (messages.length > 50) {
        logger.warn(`⚠️ 消息历史过长(${messages.length}条)，可能影响性能`);
        // 保留前几条系统消息和最后20条消息
        const systemMessages = messages.filter(msg => msg.role === 'system');
        const recentMessages = messages.slice(-20);
        messages.length = 0;
        messages.push(...systemMessages, ...recentMessages);
      }
    }

    // 如果循环结束但没有生成结果，返回最后一条 AI 回复
    if (!finalAnswer && messages.length > 0) {
      const lastAssistantMessage = [...messages].reverse().find(msg => msg.role === 'assistant');
      finalAnswer = lastAssistantMessage?.content || '思考循环结束，但未生成明确结果。';
    }

    logger.info(`✅ ReAct loop completed in ${iteration} iterations`);

    return {
      content: finalAnswer || '',
      thinkingProcess,
      iterations: iteration,
      finalAnswer,
      usage: lastUsage
    };
  }

  /**
   * 构建系统提示词（支持多段注入）
   */
  private buildSystemPrompt(options: ReActOptions): string {
    const basePrompt = options.systemPrompt || this.getDefaultSystemPrompt();
    const additionalPrompts = options.additionalPrompts || [];

    // 构建工具描述
    const toolDescriptions = Array.from(this.tools.values())
      .map(tool => `- ${tool.name}: ${tool.description}`)
      .join('\n');

    // 组合提示词
    const parts = [
      basePrompt,
      toolDescriptions ? `\n### 可用工具\n${toolDescriptions}` : '',
      ...additionalPrompts
    ].filter(Boolean);

    return parts.join('\n\n');
  }

  /**
   * 默认系统提示词
   */
  private getDefaultSystemPrompt(): string {
    return `你是一个智能业务助理。你的目标是通过连续的推理来解决用户的问题。

### 核心规则 (CRITICAL)
1. 你不能直接回答复杂问题，必须先进行推理。
2. 你必须严格遵循以下的 XML 输出格式，不要输出任何格式之外的闲聊。
3. 你的思维过程必须是连续的，每次输出只能包含【一个】行动步骤。

### 响应协议 (Protocol)
你的每一次回复必须包含且仅包含以下三种标签之一：

[情况 1：当你需要思考下一步做什么时]
<thought>
这里写你的内心独白，分析当前情况，决定下一步策略。
</thought>
<action name="工具名称">
{"参数key": "参数value"}
</action>

[情况 2：当你获得足够信息，可以回答用户时]
<thought>
我已经获取了所有必要信息，现在可以汇总回答用户了。
</thought>
<answer>
这里是给用户的最终答案。
</answer>`.trim();
  }

  /**
   * 解析 LLM 输出
   */
  private parseOutput(rawText: string): {
    thought: string | null;
    action: { name: string; params: any } | null;
    answer: string | null;
    isFinal: boolean;
  } {
    const result = {
      thought: null as string | null,
      action: null as { name: string; params: any } | null,
      answer: null as string | null,
      isFinal: false
    };

    // 提取思维链
    const thoughtMatch = rawText.match(/<thought>([\s\S]*?)<\/thought>/);
    if (thoughtMatch) {
      result.thought = thoughtMatch[1].trim();
    }

    // 提取最终答案
    const answerMatch = rawText.match(/<answer>([\s\S]*?)<\/answer>/);
    if (answerMatch) {
      result.answer = answerMatch[1].trim();
      result.isFinal = true;
      return result;
    }

    // 提取行动指令
    const actionMatch = rawText.match(/<action name="([^"]+)">([\s\S]*?)<\/action>/);
    if (actionMatch) {
      const toolName = actionMatch[1];
      let toolParams = {};
      try {
        toolParams = JSON.parse(actionMatch[2].trim());
      } catch (e) {
        logger.warn(`⚠️ 参数 JSON 解析失败，将作为纯文本传递`);
        toolParams = { raw: actionMatch[2].trim() };
      }

      result.action = {
        name: toolName,
        params: toolParams
      };
    }

    return result;
  }

  /**
   * 执行 ReAct 循环（流式版本）
   * 实时 yield 思考过程、工具执行和最终答案
   */
  async *executeStream(
    userQuery: string,
    llmClient: any,
    options: ReActOptions = {},
    abortSignal?: AbortSignal
  ): AsyncIterableIterator<string> {
    const startTime = Date.now();
    const maxIterations = options.maxIterations || 5;
    const timeout = options.timeout || 300000; // 5分钟
    const enableStreamThoughts = options.enableStreamThoughts ?? false;

    // 构建系统提示词
    const systemPrompt = this.buildSystemPrompt(options);

    // 初始化消息历史
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userQuery }
    ];

    const parser = new StreamXmlParser();
    let iteration = 0;
    let finalAnswer: string | undefined;

    while (iteration < maxIterations) {
      iteration++;

      // 检查超时
      if (Date.now() - startTime > timeout) {
        if (enableStreamThoughts) {
          yield `__THOUGHT__:${JSON.stringify({
            type: 'timeout',
            message: '达到最大超时时间，停止循环',
            iteration,
            timestamp: Date.now()
          })}\n`;
        }
        logger.warn(`⚠️ ReAct loop timeout (${timeout}ms) reached`);
        break;
      }

      // 检查中断
      if (abortSignal?.aborted) {
        logger.info('🛑 ReAct stream aborted by client');
        if (enableStreamThoughts) {
          yield `__META__:${JSON.stringify({ type: 'interrupted' })}\n`;
        }
        break;
      }

      logger.debug(`🔄 [ReAct Loop Iteration ${iteration}/${maxIterations}]`);

      if (enableStreamThoughts) {
        yield `__THOUGHT_START__:${JSON.stringify({
          iteration,
          timestamp: Date.now()
        })}\n`;
      }

      // 完整的当前轮次响应内容（用于存入历史）
      let currentTurnContent = '';

      try {
        // 调用 LLM 流式接口
        const llmStream = llmClient.streamChat(messages, { temperature: 0 }, abortSignal);

        for await (const chunk of llmStream) {
          if (abortSignal?.aborted) {
            break;
          }

          // 累积完整内容
          currentTurnContent += chunk;

          // 解析并处理事件
          for (const ev of parser.append(chunk)) {
            switch (ev.type) {
              case 'THOUGHT_START':
                break;
              case 'THOUGHT_CONTENT':
                if (enableStreamThoughts) {
                  yield `__THOUGHT__:${JSON.stringify({
                    iteration,
                    content: ev.content,
                    timestamp: Date.now()
                  })}\n`;
                }
                break;
              case 'THOUGHT_END':
                if (enableStreamThoughts) {
                  yield `__THOUGHT_END__:${JSON.stringify({ iteration })}\n`;
                }
                break;
              case 'ACTION_START':
                if (enableStreamThoughts) {
                  yield `__ACTION_START__:${JSON.stringify({
                    iteration,
                    tool: ev.actionName,
                    params: ev.actionParams,
                    timestamp: Date.now()
                  })}\n`;
                }
                break;
              case 'ACTION_CONTENT':
                break;
              case 'ACTION_END':
                break;
              case 'ANSWER_START':
                if (enableStreamThoughts) {
                  yield `__ANSWER_START__:${JSON.stringify({ timestamp: Date.now() })}\n`;
                }
                break;
              case 'ANSWER_CONTENT':
                if (enableStreamThoughts) {
                  yield `__ANSWER__:${JSON.stringify({ content: ev.content, timestamp: Date.now() })}\n`;
                } else {
                  // 当不启用思考流式输出时，只输出答案的原始内容
                  yield ev.content;
                }
                finalAnswer = (finalAnswer ?? '') + (ev.content ?? '');
                break;
              case 'ANSWER_END':
                if (enableStreamThoughts) {
                  yield `__ANSWER_END__:{}\n`;
                }
                break;
              case 'RAW_CONTENT':
                // 不处理 RAW_CONTENT，因为它会包含 XML 标签
                // 思考过程应该通过 THOUGHT_CONTENT 等事件来获取
                break;
            }
          }
        }
      } catch (err) {
        if (abortSignal?.aborted) {
          break;
        }
        logger.error('LLM stream error:', err);
        throw err;
      }

      // 流结束，处理剩余 buffer
      for (const ev of parser.finish()) {
        // 不处理 RAW_CONTENT，避免输出 XML 标签
        // 只关注 ANSWER_CONTENT（实际上应该不会走到这里）
        if (ev.type === 'ANSWER_CONTENT') {
          if (enableStreamThoughts) {
            yield `__ANSWER__:${JSON.stringify({ content: ev.content })}\n`;
          } else {
            yield ev.content;
          }
          finalAnswer = (finalAnswer ?? '') + (ev.content ?? '');
        }
      }

      // 将本轮 Assistant 回复加入历史
      messages.push({ role: 'assistant', content: currentTurnContent });

      // 解析完整内容以确定下一步（Action 或 Final Answer）
      const parsed = this.parseOutput(currentTurnContent);

      if (parsed.isFinal) {
        finalAnswer = parsed.answer;
        logger.info(`✅ ReAct loop completed with final answer`);
        break;
      }

      if (parsed.action) {
        try {
          const observation = await this.executeTool(parsed.action.name, parsed.action.params);

          if (enableStreamThoughts) {
            yield `__OBSERVATION__:${JSON.stringify({
              iteration,
              tool: parsed.action.name,
              result: observation,
              timestamp: Date.now()
            })}\n`;
          }

          messages.push({ role: 'user', content: `[系统观察] 工具 '${parsed.action.name}' 返回: ${observation}` });
        } catch (error: any) {
          const errMsg = error.message || String(error);
          if (enableStreamThoughts) {
            yield `__OBSERVATION__:${JSON.stringify({
              iteration,
              tool: parsed.action.name,
              error: errMsg,
              timestamp: Date.now()
            })}\n`;
          }
          messages.push({ role: 'user', content: `[系统警告] 工具 '${parsed.action.name}' 执行失败: ${errMsg}` });
        }
      } else {
        // 没有 Action 也没有 Final Answer
        messages.push({ role: 'user', content: '请继续分析，或给出最终结论。如果任务已完成，请明确说明。' });
      }

      // 清理历史
      if (messages.length > 50) {
        const systemMessages = messages.filter(msg => msg.role === 'system');
        const recentMessages = messages.slice(-20);
        messages.length = 0;
        messages.push(...systemMessages, ...recentMessages);
      }
    }

    // 循环结束
    if (!finalAnswer && messages.length > 0) {
      const lastAssistant = [...messages].reverse().find(msg => msg.role === 'assistant');
      finalAnswer = lastAssistant?.content || '思考循环结束，但未生成明确结果。';
      if (enableStreamThoughts) {
        yield `__ANSWER_START__:${JSON.stringify({ timestamp: Date.now() })}\n`;
        yield `__ANSWER__:${JSON.stringify({ content: finalAnswer })}\n`;
        yield `__ANSWER_END__:{}\n`;
      } else {
        yield finalAnswer;
      }
    }

    logger.info(`✅ ReAct stream completed in ${iteration} iterations`);
  }

  /**
   * 将文本分块（用于模拟打字效果）
   */
  private *chunkText(text: string, chunkSize: number): Generator<string> {
    for (let i = 0; i < text.length; i += chunkSize) {
      yield text.slice(i, i + chunkSize);
    }
  }

  /**
   * 执行工具
   */
  private async executeTool(toolName: string, params: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`未知工具: ${toolName}`);
    }

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 500));

    logger.debug(`⚙️ [ReAct Engine] Executing: ${toolName} with`, params);

    return await tool.execute(params);
  }
}

