/**
 * ErrorClassifier 单元测试
 *
 * 测试错误分类器的分类逻辑、Token估算和描述建议功能
 */

import { ErrorClassifier } from "../../../src/utils/error-classifier";
import { ErrorType } from "../../../src/types/trajectory";

describe("ErrorClassifier", () => {
  // ==================== classifyError 测试 ====================

  describe("classifyError", () => {
    describe("基于错误码分类", () => {
      it("应该将 ECONNREFUSED 分类为 NETWORK_ERROR", () => {
        const error = { code: "ECONNREFUSED" };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
      });

      it("应该将 ETIMEDOUT 分类为 NETWORK_ERROR", () => {
        const error = { code: "ETIMEDOUT" };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
      });

      it("应该将 ENOTFOUND 分类为 NETWORK_ERROR", () => {
        const error = { code: "ENOTFOUND" };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
      });

      it("应该将 ECONNRESET 分类为 NETWORK_ERROR", () => {
        const error = { code: "ECONNRESET" };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
      });

      it("应该将 EHOSTUNREACH 分类为 NETWORK_ERROR", () => {
        const error = { code: "EHOSTUNREACH" };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
      });

      it("应该将 ENOMEM 分类为 RESOURCE_EXHAUSTED", () => {
        const error = { code: "ENOMEM" };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RESOURCE_EXHAUSTED);
      });

      it("应该将 EMFILE 分类为 RESOURCE_EXHAUSTED", () => {
        const error = { code: "EMFILE" };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RESOURCE_EXHAUSTED);
      });

      it("应该将 ENFILE 分类为 RESOURCE_EXHAUSTED", () => {
        const error = { code: "ENFILE" };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RESOURCE_EXHAUSTED);
      });
    });

    describe("基于 HTTP 状态码分类", () => {
      it("应该将 429 分类为 RATE_LIMIT", () => {
        const error = { status: 429 };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RATE_LIMIT);
      });

      it("应该将 statusCode 429 分类为 RATE_LIMIT", () => {
        const error = { statusCode: 429 };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RATE_LIMIT);
      });

      it("应该将 403 分类为 PERMISSION_DENIED", () => {
        const error = { status: 403 };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.PERMISSION_DENIED);
      });

      it("应该将 400 分类为 INVALID_INPUT", () => {
        const error = { status: 400 };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.INVALID_INPUT);
      });

      it("应该将 422 分类为 INVALID_INPUT", () => {
        const error = { status: 422 };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.INVALID_INPUT);
      });

      it("应该将 401 分类为 PERMISSION_DENIED", () => {
        const error = { status: 401 };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.PERMISSION_DENIED);
      });

      it("应该将 404 分类为 INVALID_INPUT", () => {
        const error = { status: 404 };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.INVALID_INPUT);
      });

      it("应该将 500 分类为 NETWORK_ERROR", () => {
        const error = { status: 500 };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
      });

      it("应该将 502 分类为 NETWORK_ERROR", () => {
        const error = { status: 502 };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
      });

      it("应该将 503 分类为 NETWORK_ERROR", () => {
        const error = { status: 503 };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
      });

      it("应该将 504 分类为 NETWORK_ERROR", () => {
        const error = { status: 504 };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
      });
    });

    describe("业务逻辑错误分类", () => {
      it("应该将 BusinessError 分类为 LOGIC_ERROR", () => {
        const error = { name: "BusinessError" };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.LOGIC_ERROR);
      });

      it("应该将 ValidationError 分类为 LOGIC_ERROR", () => {
        const error = { name: "ValidationError" };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.LOGIC_ERROR);
      });

      it("应该将 LogicError 分类为 LOGIC_ERROR", () => {
        const error = { name: "LogicError" };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.LOGIC_ERROR);
      });
    });

    describe("基于错误消息关键词分类", () => {
      describe("资源耗尽关键词", () => {
        it("应该识别 out of memory", () => {
          const error = { message: "Process ran out of memory" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RESOURCE_EXHAUSTED);
        });

        it("应该识别 heap 相关", () => {
          const error = { message: "JavaScript heap out of memory" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RESOURCE_EXHAUSTED);
        });

        it("应该识别 allocation failed", () => {
          const error = { message: "Memory allocation failed" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RESOURCE_EXHAUSTED);
        });

        it("应该识别 disk full", () => {
          const error = { message: "Disk is full" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RESOURCE_EXHAUSTED);
        });

        it("应该识别 quota exceeded", () => {
          const error = { message: "Storage quota exceeded" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RESOURCE_EXHAUSTED);
        });

        it("应该识别 out of space", () => {
          const error = { message: "System out of space" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RESOURCE_EXHAUSTED);
        });
      });

      describe("速率限制关键词", () => {
        it("应该识别 rate limit", () => {
          const error = { message: "Rate limit exceeded" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RATE_LIMIT);
        });

        it("应该识别 too many requests", () => {
          const error = { message: "Too many requests, please slow down" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.RATE_LIMIT);
        });
      });

      describe("超时关键词", () => {
        it("应该识别 timeout", () => {
          const error = { message: "Request timeout" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.TIMEOUT);
        });

        it("应该识别 timed out", () => {
          const error = { message: "Connection timed out" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.TIMEOUT);
        });
      });

      describe("权限相关关键词", () => {
        it("应该识别 permission", () => {
          const error = { message: "Permission denied" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.PERMISSION_DENIED);
        });

        it("应该识别 forbidden", () => {
          const error = { message: "Access forbidden" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.PERMISSION_DENIED);
        });

        it("应该识别 unauthorized", () => {
          const error = { message: "Unauthorized access" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.PERMISSION_DENIED);
        });

        it("应该识别 access denied", () => {
          const error = { message: "Access denied" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.PERMISSION_DENIED);
        });

        it("应该识别 insufficient privileges", () => {
          const error = { message: "Insufficient privileges" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.PERMISSION_DENIED);
        });
      });

      describe("网络相关关键词", () => {
        it("应该识别 connection", () => {
          const error = { message: "Connection refused" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
        });

        it("应该识别 network", () => {
          const error = { message: "Network unreachable" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
        });

        it("应该识别 refused", () => {
          const error = { message: "Connection refused by server" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
        });

        it("应该识别 unreachable", () => {
          const error = { message: "Host unreachable" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
        });

        it("应该识别 dns", () => {
          const error = { message: "DNS resolution failed" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
        });
      });

      describe("输入参数相关关键词", () => {
        it("应该识别 invalid", () => {
          const error = { message: "Invalid parameter" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.INVALID_INPUT);
        });

        it("应该识别 validation", () => {
          const error = { message: "Validation failed" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.INVALID_INPUT);
        });

        it("应该识别 required", () => {
          const error = { message: "Parameter required" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.INVALID_INPUT);
        });

        it("应该识别 missing", () => {
          const error = { message: "Missing required field" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.INVALID_INPUT);
        });

        it("应该识别 bad request", () => {
          const error = { message: "Bad request" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.INVALID_INPUT);
        });

        it("应该识别 malformed", () => {
          const error = { message: "Malformed JSON" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.INVALID_INPUT);
        });
      });

      describe("超时补充检测", () => {
        it("应该识别 exceeded (非 rate limit)", () => {
          const error = { message: "Time exceeded" };
          expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.TIMEOUT);
        });
      });
    });

    describe("默认未知错误", () => {
      it("应该将空对象分类为 UNKNOWN", () => {
        const error = {};
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.UNKNOWN);
      });

      it("应该将无匹配消息的错误分类为 UNKNOWN", () => {
        const error = { message: "Some random error that does not match any pattern" };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.UNKNOWN);
      });

      it("应该将 null 作为错误处理", () => {
        expect(ErrorClassifier.classifyError(null)).toBe(ErrorType.UNKNOWN);
      });

      it("应该将 undefined 作为错误处理", () => {
        expect(ErrorClassifier.classifyError(undefined)).toBe(ErrorType.UNKNOWN);
      });
    });

    describe("优先级测试", () => {
      it("错误码应优先于消息关键词", () => {
        // 即使消息包含 timeout，ECONNREFUSED 仍应被分类为 NETWORK_ERROR
        const error = {
          code: "ECONNREFUSED",
          message: "Connection timeout",
        };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
      });

      it("HTTP 状态码应优先于消息关键词", () => {
        // 即使消息包含 timeout，500 仍应被分类为 NETWORK_ERROR
        const error = {
          status: 500,
          message: "Request timeout",
        };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.NETWORK_ERROR);
      });

      it("业务逻辑错误应优先于关键词", () => {
        const error = {
          name: "BusinessError",
          message: "connection refused",
        };
        expect(ErrorClassifier.classifyError(error)).toBe(ErrorType.LOGIC_ERROR);
      });
    });
  });

  // ==================== estimateTokens 测试 ====================

  describe("estimateTokens", () => {
    it("应该返回空字符串的 0 token", () => {
      expect(ErrorClassifier.estimateTokens("")).toBe(0);
    });

    it("应该处理 null", () => {
      expect(ErrorClassifier.estimateTokens(null as any)).toBe(0);
    });

    it("应该处理 undefined", () => {
      expect(ErrorClassifier.estimateTokens(undefined as any)).toBe(0);
    });

    it("应该正确估算英文字符", () => {
      // 4 英文 = 1 token, 16 字符 = 4 tokens
      expect(ErrorClassifier.estimateTokens("hello world test")).toBe(4);
    });

    it("应该正确估算中文字符", () => {
      // 2 中文 = 1 token, 4 字符 = 2 tokens
      expect(ErrorClassifier.estimateTokens("你好世界")).toBe(2);
    });

    it("应该正确估算混合文本", () => {
      // hello(5) + 世界(2) = 5/4 + 2/2 = 2 + 1 = 3
      expect(ErrorClassifier.estimateTokens("hello世界")).toBe(3);
    });

    it("应该正确估算数字和空格", () => {
      // 12345(5) +  (1) = 6/4 = 2
      expect(ErrorClassifier.estimateTokens("12345 ")).toBe(2);
    });

    it("应该处理长文本", () => {
      const longText =
        "This is a long piece of text that should be properly tokenized for testing purposes.";
      const tokens = ErrorClassifier.estimateTokens(longText);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(longText.length);
    });
  });

  // ==================== getErrorTypeDescription 测试 ====================

  describe("getErrorTypeDescription", () => {
    it("应该返回 NETWORK_ERROR 的描述", () => {
      expect(ErrorClassifier.getErrorTypeDescription(ErrorType.NETWORK_ERROR)).toBe(
        "网络连接失败或服务器无响应"
      );
    });

    it("应该返回 TIMEOUT 的描述", () => {
      expect(ErrorClassifier.getErrorTypeDescription(ErrorType.TIMEOUT)).toBe("请求超时");
    });

    it("应该返回 RATE_LIMIT 的描述", () => {
      expect(ErrorClassifier.getErrorTypeDescription(ErrorType.RATE_LIMIT)).toBe("API 速率限制");
    });

    it("应该返回 INVALID_INPUT 的描述", () => {
      expect(ErrorClassifier.getErrorTypeDescription(ErrorType.INVALID_INPUT)).toBe("输入参数错误");
    });

    it("应该返回 LOGIC_ERROR 的描述", () => {
      expect(ErrorClassifier.getErrorTypeDescription(ErrorType.LOGIC_ERROR)).toBe("业务逻辑错误");
    });

    it("应该返回 RESOURCE_EXHAUSTED 的描述", () => {
      expect(ErrorClassifier.getErrorTypeDescription(ErrorType.RESOURCE_EXHAUSTED)).toBe(
        "资源耗尽（内存/磁盘等）"
      );
    });

    it("应该返回 PERMISSION_DENIED 的描述", () => {
      expect(ErrorClassifier.getErrorTypeDescription(ErrorType.PERMISSION_DENIED)).toBe("权限不足");
    });

    it("应该返回 UNKNOWN 的描述", () => {
      expect(ErrorClassifier.getErrorTypeDescription(ErrorType.UNKNOWN)).toBe("未知错误");
    });

    it("应该处理无效类型", () => {
      // 使用不存在的类型值，确保触发 default 分支
      expect(ErrorClassifier.getErrorTypeDescription("invalid_type" as ErrorType)).toBe(
        "未知错误类型"
      );
    });
  });

  // ==================== getErrorTypeSuggestion 测试 ====================

  describe("getErrorTypeSuggestion", () => {
    it("应该返回 NETWORK_ERROR 的建议", () => {
      expect(ErrorClassifier.getErrorTypeSuggestion(ErrorType.NETWORK_ERROR)).toBe(
        "检查网络连接和服务可用性，考虑添加重试机制"
      );
    });

    it("应该返回 TIMEOUT 的建议", () => {
      expect(ErrorClassifier.getErrorTypeSuggestion(ErrorType.TIMEOUT)).toBe(
        "将数据分批处理，每批不超过 100 条，或增加超时时间"
      );
    });

    it("应该返回 RATE_LIMIT 的建议", () => {
      expect(ErrorClassifier.getErrorTypeSuggestion(ErrorType.RATE_LIMIT)).toBe(
        "添加速率限制器，间隔至少 1 秒，或使用队列控制并发"
      );
    });

    it("应该返回 INVALID_INPUT 的建议", () => {
      expect(ErrorClassifier.getErrorTypeSuggestion(ErrorType.INVALID_INPUT)).toBe(
        "增加输入校验逻辑，确保参数格式正确"
      );
    });

    it("应该返回 LOGIC_ERROR 的建议", () => {
      expect(ErrorClassifier.getErrorTypeSuggestion(ErrorType.LOGIC_ERROR)).toBe(
        "检查业务逻辑前置条件，确保数据完整性"
      );
    });

    it("应该返回 RESOURCE_EXHAUSTED 的建议", () => {
      expect(ErrorClassifier.getErrorTypeSuggestion(ErrorType.RESOURCE_EXHAUSTED)).toBe(
        "使用流式处理或分块读取，释放不需要的资源"
      );
    });

    it("应该返回 PERMISSION_DENIED 的建议", () => {
      expect(ErrorClassifier.getErrorTypeSuggestion(ErrorType.PERMISSION_DENIED)).toBe(
        "检查 API Key 或权限配置，确保有足够权限"
      );
    });

    it("应该返回 UNKNOWN 的建议", () => {
      expect(ErrorClassifier.getErrorTypeSuggestion(ErrorType.UNKNOWN)).toBe(
        "记录详细日志，人工分析根本原因"
      );
    });

    it("应该处理无效类型", () => {
      // 使用不存在的类型值，确保触发 default 分支
      expect(ErrorClassifier.getErrorTypeSuggestion("invalid_type" as ErrorType)).toBe(
        "未知错误类型，建议检查日志"
      );
    });
  });
});
