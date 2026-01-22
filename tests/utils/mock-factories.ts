/**
 * 测试工具类 - Mock 工厂
 * 提供统一的 Mock 创建工具，简化测试代码
 */

type AnyFunction = (...args: any[]) => any;

/**
 * Logger Mock 工厂
 */
export class MockLogger {
  static create() {
    return {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  }

  static createNoop() {
    return {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  }
}

/**
 * LLM Adapter Mock 工厂
 */
export class MockLLMAdapter {
  static createChatResponse(response: string) {
    return jest.fn().mockResolvedValue({
      id: "test-response-id",
      object: "chat.completion",
      created: Date.now(),
      model: "test-model",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: response,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    });
  }

  static createStreamResponse(chunks: string[]) {
    return function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    };
  }

  static create() {
    return {
      chat: jest.fn(),
      streamChat: jest.fn(),
      embed: jest.fn(),
    };
  }
}

/**
 * Tool Registry Mock 工厂
 */
export class MockToolRegistry {
  static create(tools: Array<{ id: string; name: string }> = []) {
    const toolMap = new Map(tools.map((t) => [t.id, t]));

    return {
      register: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockImplementation((id: string) => {
        const tool = toolMap.get(id);
        return Promise.resolve(tool ? { ...tool, init: jest.fn(), execute: jest.fn() } : undefined);
      }),
      unregister: jest.fn().mockResolvedValue(true),
      list: jest.fn().mockResolvedValue(tools.map((t) => ({ ...t, init: jest.fn() }))),
      has: jest.fn().mockImplementation((id: string) => toolMap.has(id)),
      updateStatus: jest.fn().mockResolvedValue(true),
      isHealthy: jest.fn().mockResolvedValue(true),
      getUnhealthyTools: jest.fn().mockResolvedValue([]),
      size: jest.fn().mockResolvedValue(toolMap.size),
    };
  }

  static empty() {
    return this.create([]);
  }
}

/**
 * Database Mock 工厂
 */
export class MockDatabase {
  static create() {
    return {
      prepare: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        all: jest.fn().mockReturnValue([]),
        run: jest.fn().mockReturnValue({ changes: 0 }),
      }),
      exec: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
      transaction: jest.fn().mockImplementation((fn: AnyFunction) => fn),
    };
  }
}

/**
 * Event Emitter Mock 工厂
 */
export class MockEventEmitter {
  static create() {
    const listeners = new Map<string, Set<AnyFunction>>();

    return {
      on: jest.fn().mockImplementation((event: string, callback: AnyFunction) => {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event)!.add(callback);
      }),
      off: jest.fn().mockImplementation((event: string, callback: AnyFunction) => {
        listeners.get(event)?.delete(callback);
      }),
      emit: jest.fn().mockImplementation((event: string, ...args: unknown[]) => {
        listeners.get(event)?.forEach((callback) => callback(...args));
      }),
      once: jest.fn().mockImplementation((event: string, callback: AnyFunction) => {
        const wrapper = (...args: unknown[]) => {
          callback(...args);
          listeners.get(event)?.delete(wrapper);
        };
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event)!.add(wrapper);
      }),
      removeAllListeners: jest.fn().mockImplementation((event?: string) => {
        if (event) {
          listeners.delete(event);
        } else {
          listeners.clear();
        }
      }),
    };
  }
}

/**
 * 向量数据库 Mock 工厂
 */
export class MockVectorDB {
  static create() {
    return {
      connect: jest.fn().mockResolvedValue({
        close: jest.fn().mockResolvedValue(undefined),
        createTable: jest.fn().mockResolvedValue({
          add: jest.fn().mockResolvedValue(undefined),
          delete: jest.fn().mockResolvedValue(undefined),
          query: jest.fn().mockReturnValue({
            nearestTo: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            toArray: jest.fn().mockResolvedValue([]),
          }),
          countRows: jest.fn().mockResolvedValue(0),
          createIndex: jest.fn().mockResolvedValue(undefined),
        }),
        openTable: jest.fn().mockResolvedValue({
          add: jest.fn().mockResolvedValue(undefined),
          delete: jest.fn().mockResolvedValue(undefined),
          query: jest.fn().mockReturnValue({
            nearestTo: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            toArray: jest.fn().mockResolvedValue([]),
          }),
          countRows: jest.fn().mockResolvedValue(0),
          createIndex: jest.fn().mockResolvedValue(undefined),
        }),
        dropTable: jest.fn().mockResolvedValue(undefined),
        tableNames: jest.fn().mockResolvedValue([]),
      }),
      close: jest.fn().mockResolvedValue(undefined),
      createTable: jest.fn(),
      openTable: jest.fn(),
      dropTable: jest.fn(),
      tableNames: jest.fn().mockResolvedValue([]),
    };
  }
}

/**
 * 工具执行结果 Mock 工厂
 */
export class MockToolResult {
  static success(output: string, duration = 100) {
    return {
      success: true,
      output,
      duration,
      exitCode: 0,
    };
  }

  static failure(error: string, duration = 100) {
    return {
      success: false,
      error,
      duration,
      errorCode: "TOOL_EXECUTION_ERROR",
      exitCode: 1,
    };
  }
}

/**
 * 消息 Mock 工厂
 */
export class MockMessage {
  static user(content: string) {
    return { role: "user" as const, content };
  }

  static assistant(content: string) {
    return { role: "assistant" as const, content };
  }

  static system(content: string) {
    return { role: "system" as const, content };
  }

  static conversation(messages: Array<{ role: string; content: string }>) {
    return messages;
  }
}

/**
 * 延迟辅助函数
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * 异步队列辅助函数
 */
export const waitFor = (condition: () => boolean, timeout = 5000): Promise<void> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error("Timeout waiting for condition"));
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
};
