/**
 * Tool Framework - 工具定义和工厂函数
 * 基于 OpenSpec 提案的工具框架设计
 */

/**
 * 工具命名空间
 * 提供工具定义和工厂函数
 */
export namespace Tool {
  /**
   * 工具元数据
   */
  export interface Metadata {
    [key: string]: unknown;
  }

  /**
   * 工具初始化上下文
   */
  export interface InitContext {
    agent?: {
      id: string;
      name: string;
    };
  }

  /**
   * 工具执行上下文
   */
  export interface Context {
    /** 会话 ID */
    sessionID: string;
    /** 消息 ID */
    messageID: string;
    /** Agent 标识 */
    agent: string;
    /** 中止信号 */
    abort: AbortSignal;
    /** 调用 ID */
    callID?: string;
    /** 额外数据 */
    extra?: Record<string, unknown>;
    /**
     * 设置工具响应元数据
     * @param input - 元数据输入
     */
    metadata(input: { title?: string; metadata?: Metadata }): void;
  }

  /**
   * 文件附件类型
   */
  export interface FilePart {
    type: "file";
    file: {
      filename: string;
      fileData?: string;
      mimeType?: string;
    };
  }

  /**
   * 工具定义接口
   * @typeParam Parameters - 参数类型
   * @typeParam M - 元数据类型
   */
  export interface Info<Parameters = Record<string, unknown>, M extends Metadata = Metadata> {
    /** 工具唯一标识符 */
    id: string;
    /** 工具初始化函数 */
    init: (ctx?: InitContext) => Promise<{
      /** 工具描述 */
      description: string;
      /** 参数模式 */
      parameters: {
        type: "object";
        properties?: Record<string, unknown>;
        required?: string[];
        additionalProperties?: boolean;
      };
      /**
       * 工具执行函数
       * @param args - 工具参数
       * @param ctx - 执行上下文
       * @returns 执行结果
       */
      execute(
        args: Parameters,
        ctx: Context
      ): Promise<{
        /** 响应标题 */
        title: string;
        /** 元数据 */
        metadata: M;
        /** 输出内容 */
        output: string;
        /** 附件文件 */
        attachments?: FilePart[];
      }>;
      /** 参数验证错误格式化函数 */
      formatValidationError?(error: { errors: Array<{ path: string; message: string }> }): string;
    }>;
  }

  /**
   * 从工具定义推断参数类型
   */
  export type InferParameters<T extends Info> = T extends Info<infer P> ? P : never;

  /**
   * 从工具定义推断元数据类型
   */
  export type InferMetadata<T extends Info> = T extends Info<any, infer M> ? M : never;

  /**
   * 输出截断配置
   */
  export interface TruncateOptions {
    maxLines?: number;
    maxBytes?: number;
    direction?: "head" | "tail";
  }

  /**
   * 默认截断配置
   */
  const DEFAULT_TRUNCATE_OPTIONS: Required<TruncateOptions> = {
    maxLines: 2000,
    maxBytes: 50 * 1024,
    direction: "head",
  };

  /**
   * 截断输出内容
   * @param text - 原始文本
   * @param options - 截断选项
   * @returns 截断结果
   */
  function truncateOutput(
    text: string,
    options?: TruncateOptions
  ): { content: string; truncated: boolean } {
    const opts = { ...DEFAULT_TRUNCATE_OPTIONS, ...options };
    const lines = text.split("\n");
    const totalBytes = Buffer.byteLength(text, "utf-8");

    if (lines.length <= opts.maxLines && totalBytes <= opts.maxBytes) {
      return { content: text, truncated: false };
    }

    const out: string[] = [];
    let bytes = 0;
    let hitBytes = false;
    let i = 0;

    if (opts.direction === "head") {
      for (i = 0; i < lines.length && i < opts.maxLines; i++) {
        const lineSize = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0);
        if (bytes + lineSize > opts.maxBytes) {
          hitBytes = true;
          break;
        }
        out.push(lines[i]);
        bytes += lineSize;
      }
      const removed = hitBytes ? totalBytes - bytes : lines.length - out.length;
      const unit = hitBytes ? "chars" : "lines";
      return {
        content: `${out.join("\n")}\n\n...${removed} ${unit} truncated...`,
        truncated: true,
      };
    }

    for (i = lines.length - 1; i >= 0 && out.length < opts.maxLines; i--) {
      const lineSize = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0);
      if (bytes + lineSize > opts.maxBytes) {
        hitBytes = true;
        break;
      }
      out.unshift(lines[i]);
      bytes += lineSize;
    }
    const removed = hitBytes ? totalBytes - bytes : lines.length - out.length;
    const unit = hitBytes ? "chars" : "lines";
    return {
      content: `...${removed} ${unit} truncated...\n\n${out.join("\n")}`,
      truncated: true,
    };
  }

  /**
   * 定义工具的工厂函数
   * @typeParam Parameters - 参数类型
   * @typeParam Result - 结果元数据类型
   * @param id - 工具唯一标识符
   * @param init - 工具初始化函数或已解析的工具信息
   * @returns 工具定义
   */
  export function define<Parameters extends Record<string, unknown>, Result extends Metadata>(
    id: string,
    init: Info<Parameters, Result>["init"] | Awaited<ReturnType<Info<Parameters, Result>["init"]>>
  ): Info<Parameters, Result> {
    return {
      id,
      init: async (ctx) => {
        const toolInfo = init instanceof Function ? await init(ctx) : init;

        const originalExecute = toolInfo.execute;

        // 包装 execute 函数，添加参数验证和输出截断
        toolInfo.execute = async (args, ctx) => {
          // 参数验证
          const { properties, required = [] } = toolInfo.parameters;

          // 检查必需参数
          for (const param of required) {
            if (args[param] === undefined || args[param] === null) {
              const errorMessage = `Missing required parameter: ${param}`;
              if (toolInfo.formatValidationError) {
                throw new Error(
                  toolInfo.formatValidationError({
                    errors: [{ path: param, message: errorMessage }],
                  })
                );
              }
              throw new Error(errorMessage);
            }
          }

          // 执行原始函数
          const result = await originalExecute(args, ctx);

          // 截断输出
          const truncated = truncateOutput(result.output);
          return {
            ...result,
            output: truncated.content,
            metadata: {
              ...result.metadata,
              truncated: truncated.truncated,
            } as Result,
          };
        };

        return toolInfo;
      },
    };
  }
}
