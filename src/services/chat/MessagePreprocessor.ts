/**
 * MessagePreprocessor - 消息预处理器
 * 负责消息的系统提示词注入和变量替换
 */

import { Message, ChatOptions } from "../../types";
import { logger } from "../../utils/logger";
import { SystemPromptService } from "../SystemPromptService";
import { VariableEngine } from "../../core/variable/VariableEngine";

export interface PreprocessResult {
  messages: Message[];
  variableCount: number;
}

export class MessagePreprocessor {
  constructor(
    private systemPromptService: SystemPromptService,
    private variableEngine: VariableEngine
  ) {}

  /**
   * 预处理消息：注入系统提示词 + 变量替换
   */
  async preprocess(
    messages: Message[],
    options: ChatOptions,
    strategyVariables: Record<string, string> = {}
  ): Promise<PreprocessResult> {
    let processedMessages = [...messages];

    // DEBUG: 检查输入消息中的图片数据
    this.debugImageData(messages, "Input");

    // 1. 注入系统提示词（如果没有）
    const hasSystemMessage = processedMessages.some((m) => m.role === "system");
    if (!hasSystemMessage) {
      const systemPromptTemplate = this.systemPromptService.getSystemPromptTemplate();
      if (systemPromptTemplate) {
        processedMessages = [
          { role: "system", content: systemPromptTemplate } as Message,
          ...processedMessages,
        ];
        logger.debug(
          `[MessagePreprocessor] Injected system prompt (${systemPromptTemplate.length} chars)`
        );
      }
    }

    // 2. 构建统一的变量上下文
    const variables = this.buildVariableContext(options, strategyVariables);

    // 3. 统一变量替换
    processedMessages = await this.variableEngine.resolveMessages(processedMessages, variables);
    logger.debug(
      `[MessagePreprocessor] Variable replacement completed with ${Object.keys(variables).length} variables`
    );

    // DEBUG: 检查输出消息中的图片数据
    this.debugImageData(processedMessages, "Output");

    return {
      messages: processedMessages,
      variableCount: Object.keys(variables).length,
    };
  }

  /**
   * 构建变量上下文
   */
  private buildVariableContext(
    options: ChatOptions,
    strategyVariables: Record<string, string>
  ): Record<string, string> {
    return {
      // 基础变量
      model: options.model || "",
      provider: options.provider || "",
      current_time: new Date().toISOString(),
      user_prompt: options.user_prompt || "",
      // 从 options 中提取字符串类型的变量
      ...Object.entries(options).reduce(
        (acc, [key, value]) => {
          if (typeof value !== "function") {
            acc[key] = value;
          }
          return acc;
        },
        {} as Record<string, any>
      ),
      // 策略提供的变量（如 available_tools）
      ...strategyVariables,
    };
  }

  /**
   * 调试图片数据
   *
   * M-005 修复：敏感数据脱敏，不记录完整 URL
   */
  private debugImageData(messages: Message[], stage: string): void {
    const imageCount = messages.filter(
      (m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url")
    ).length;

    if (imageCount > 0) {
      logger.debug(`[MessagePreprocessor] ${stage} has ${imageCount} multimodal messages`);
      messages.forEach((msg, idx) => {
        if (Array.isArray(msg.content)) {
          msg.content.forEach((part, pIdx) => {
            if (part.type === "image_url") {
              const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
              if (url) {
                // M-005: 敏感数据脱敏 - 只记录 URL 长度和是否包含 base64，不记录完整 URL
                const isBase64 = url.includes(";base64,");
                const urlLength = url.length;
                logger.debug(
                  `[MessagePreprocessor] ${stage} msg[${idx}].content[${pIdx}]: ${urlLength} chars, has ;base64,: ${isBase64}`
                );
              }
            }
          });
        }
      });
    }
  }
}
