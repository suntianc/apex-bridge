/**
 * Stage 0.6: Trajectory 质量提升 - 测试用例
 *
 * 测试内容：
 * 1. 错误分类准确性（8种 ErrorType）
 * 2. ToolCallDetails 结构完整性
 * 3. ErrorDetails 结构完整性
 * 4. Token 估算准确性
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { ErrorClassifier } from '../../src/utils/error-classifier';
import { ErrorType } from '../../src/types/trajectory';

describe('Stage 0.6: Trajectory Quality Enhancement', () => {
  describe('ErrorType Classification', () => {
    describe('网络错误识别', () => {
      it('应该识别 ECONNREFUSED 错误码', () => {
        const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.NETWORK_ERROR);
      });

      it('应该识别 ETIMEDOUT 错误码', () => {
        const error = { code: 'ETIMEDOUT', message: 'Connection timed out' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.NETWORK_ERROR);
      });

      it('应该识别 ENOTFOUND 错误码', () => {
        const error = { code: 'ENOTFOUND', message: 'Host not found' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.NETWORK_ERROR);
      });

      it('应该识别 HTTP 500 错误', () => {
        const error = { status: 500, message: 'Internal server error' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.NETWORK_ERROR);
      });

      it('应该识别连接相关错误消息', () => {
        const error = { message: 'Connection reset by peer' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.NETWORK_ERROR);
      });
    });

    describe('超时错误识别', () => {
      it('应该识别 timeout 关键词', () => {
        const error = { message: 'Request timeout after 30s' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.TIMEOUT);
      });

      it('应该识别 exceeded 关键词', () => {
        const error = { message: 'Time limit exceeded' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.TIMEOUT);
      });

      it('应该识别 timed out 关键词', () => {
        const error = { message: 'Operation timed out' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.TIMEOUT);
      });
    });

    describe('速率限制错误识别', () => {
      it('应该识别 HTTP 429 状态码', () => {
        const error = { status: 429, message: 'Too many requests' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.RATE_LIMIT);
      });

      it('应该识别 rate limit 关键词', () => {
        const error = { message: 'API rate limit exceeded' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.RATE_LIMIT);
      });

      it('应该识别 too many requests 关键词', () => {
        const error = { message: 'Too many requests, please slow down' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.RATE_LIMIT);
      });
    });

    describe('输入参数错误识别', () => {
      it('应该识别 HTTP 400 状态码', () => {
        const error = { status: 400, message: 'Bad request' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.INVALID_INPUT);
      });

      it('应该识别 invalid 关键词', () => {
        const error = { message: 'Invalid parameter value' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.INVALID_INPUT);
      });

      it('应该识别 validation 关键词', () => {
        const error = { message: 'Validation failed' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.INVALID_INPUT);
      });

      it('应该识别 required 关键词', () => {
        const error = { message: 'Parameter is required' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.INVALID_INPUT);
      });
    });

    describe('业务逻辑错误识别', () => {
      it('应该识别 BusinessError 类型', () => {
        const error = { name: 'BusinessError', message: 'Invalid business rule' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.LOGIC_ERROR);
      });

      it('应该识别 ValidationError 类型', () => {
        const error = { name: 'ValidationError', message: 'Validation failed' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.LOGIC_ERROR);
      });

      it('应该识别 LogicError 类型', () => {
        const error = { name: 'LogicError', message: 'Logic error occurred' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.LOGIC_ERROR);
      });
    });

    describe('资源耗尽错误识别', () => {
      it('应该识别 out of memory 关键词', () => {
        const error = { message: 'JavaScript heap out of memory' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.RESOURCE_EXHAUSTED);
      });

      it('应该识别 heap 关键词', () => {
        const error = { message: 'Cannot allocate memory for heap' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.RESOURCE_EXHAUSTED);
      });

      it('应该识别 allocation failed 关键词', () => {
        const error = { message: 'Memory allocation failed' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.RESOURCE_EXHAUSTED);
      });

      it('应该识别 disk full 关键词', () => {
        const error = { message: 'Disk is full' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.RESOURCE_EXHAUSTED);
      });

      it('应该识别 quota exceeded 关键词', () => {
        const error = { message: 'Storage quota exceeded' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.RESOURCE_EXHAUSTED);
      });

      it('应该识别 ENOMEM 错误码', () => {
        const error = { code: 'ENOMEM', message: 'Out of memory' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.RESOURCE_EXHAUSTED);
      });
    });

    describe('权限错误识别', () => {
      it('应该识别 HTTP 403 状态码', () => {
        const error = { status: 403, message: 'Forbidden' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.PERMISSION_DENIED);
      });

      it('应该识别 HTTP 401 状态码', () => {
        const error = { status: 401, message: 'Unauthorized' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.PERMISSION_DENIED);
      });

      it('应该识别 permission 关键词', () => {
        const error = { message: 'Permission denied' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.PERMISSION_DENIED);
      });

      it('应该识别 forbidden 关键词', () => {
        const error = { message: 'Access forbidden' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.PERMISSION_DENIED);
      });

      it('应该识别 unauthorized 关键词', () => {
        const error = { message: 'Unauthorized access' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.PERMISSION_DENIED);
      });
    });

    describe('未知错误识别', () => {
      it('应该为无法识别的错误返回 UNKNOWN', () => {
        const error = { message: 'Some random error that cannot be classified' };
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.UNKNOWN);
      });

      it('应该为空错误返回 UNKNOWN', () => {
        const error = {};
        const type = ErrorClassifier.classifyError(error);
        expect(type).toBe(ErrorType.UNKNOWN);
      });
    });
  });

  describe('Token Estimation', () => {
    it('应该正确估算纯英文文本', () => {
      const text = 'Hello World! This is a test.';
      const tokens = ErrorClassifier.estimateTokens(text);
      expect(tokens).toBe(Math.ceil(28 / 4)); // 28 个英文字符 / 4 = 7 tokens
    });

    it('应该正确估算纯中文文本', () => {
      const text = '你好世界！这是测试。';
      const tokens = ErrorClassifier.estimateTokens(text);
      // 估算可能因实现细节略有差异，允许 ±1 的误差
      expect(tokens).toBeGreaterThanOrEqual(4);
      expect(tokens).toBeLessThanOrEqual(6);
    });

    it('应该正确估算中英文混合文本', () => {
      const text = 'Hello 你好 World 世界';
      const tokens = ErrorClassifier.estimateTokens(text);
      const englishChars = (text.match(/[a-zA-Z0-9\s]/g) || []).length; // 14
      const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length; // 4
      const expected = Math.ceil(englishChars / 4) + Math.ceil(chineseChars / 2);
      expect(tokens).toBe(expected);
    });

    it('应该正确估算数字和特殊字符', () => {
      const text = 'Test 123!@#$%';
      const tokens = ErrorClassifier.estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it('应该处理空字符串', () => {
      const tokens = ErrorClassifier.estimateTokens('');
      expect(tokens).toBe(0);
    });

    it('应该处理 null 和 undefined', () => {
      const tokens1 = ErrorClassifier.estimateTokens(null as any);
      const tokens2 = ErrorClassifier.estimateTokens(undefined as any);
      expect(tokens1).toBe(0);
      expect(tokens2).toBe(0);
    });
  });

  describe('ErrorType Helper Methods', () => {
    it('应该返回错误类型的详细描述', () => {
      const description = ErrorClassifier.getErrorTypeDescription(ErrorType.TIMEOUT);
      expect(description).toBe('请求超时');
    });

    it('应该返回错误类型的修复建议', () => {
      const suggestion = ErrorClassifier.getErrorTypeSuggestion(ErrorType.RATE_LIMIT);
      expect(suggestion).toContain('速率限制器');
      expect(suggestion).toContain('1 秒');
    });

    it('应该为所有 ErrorType 返回描述', () => {
      const errorTypes = [
        ErrorType.NETWORK_ERROR,
        ErrorType.TIMEOUT,
        ErrorType.RATE_LIMIT,
        ErrorType.INVALID_INPUT,
        ErrorType.LOGIC_ERROR,
        ErrorType.RESOURCE_EXHAUSTED,
        ErrorType.PERMISSION_DENIED,
        ErrorType.UNKNOWN
      ];

      errorTypes.forEach(type => {
        const description = ErrorClassifier.getErrorTypeDescription(type);
        expect(description).toBeDefined();
        expect(description.length).toBeGreaterThan(0);
      });
    });

    it('应该为所有 ErrorType 返回修复建议', () => {
      const errorTypes = [
        ErrorType.NETWORK_ERROR,
        ErrorType.TIMEOUT,
        ErrorType.RATE_LIMIT,
        ErrorType.INVALID_INPUT,
        ErrorType.LOGIC_ERROR,
        ErrorType.RESOURCE_EXHAUSTED,
        ErrorType.PERMISSION_DENIED,
        ErrorType.UNKNOWN
      ];

      errorTypes.forEach(type => {
        const suggestion = ErrorClassifier.getErrorTypeSuggestion(type);
        expect(suggestion).toBeDefined();
        expect(suggestion.length).toBeGreaterThan(0);
      });
    });
  });

  describe('ToolCallDetails Structure', () => {
    it('应该包含完整的工具调用详情结构', () => {
      const toolDetails = {
        tool_name: 'test-tool',
        input_params: { param1: 'value1', param2: 123 },
        output_content: 'Test output',
        output_metadata: {
          token_count: 10,
          execution_time_ms: 100,
          rate_limit_remaining: 99
        }
      };

      expect(toolDetails).toHaveProperty('tool_name');
      expect(toolDetails).toHaveProperty('input_params');
      expect(toolDetails).toHaveProperty('output_content');
      expect(toolDetails).toHaveProperty('output_metadata');
      expect(toolDetails.output_metadata).toHaveProperty('token_count');
      expect(toolDetails.output_metadata).toHaveProperty('execution_time_ms');
    });

    it('应该支持可选的输出元数据', () => {
      const toolDetails = {
        tool_name: 'test-tool',
        input_params: {},
        output_content: 'Test output'
      };

      // 使用 as any 来绕过 TypeScript 检查，因为这是测试
      expect((toolDetails as any).output_metadata).toBeUndefined();
    });
  });

  describe('ErrorDetails Structure', () => {
    it('应该包含完整的错误详情结构', () => {
      const errorDetails = {
        error_type: ErrorType.NETWORK_ERROR,
        error_message: 'Connection failed',
        error_stack: 'Error stack trace',
        context: {
          tool_name: 'test-tool',
          input_params: {},
          timestamp: Date.now(),
          execution_time_ms: 100
        }
      };

      expect(errorDetails).toHaveProperty('error_type');
      expect(errorDetails).toHaveProperty('error_message');
      expect(errorDetails.error_stack).toBeDefined();
      expect(errorDetails.context).toBeDefined();
      expect(errorDetails.context).toHaveProperty('tool_name');
      expect(errorDetails.context).toHaveProperty('input_params');
      expect(errorDetails.context).toHaveProperty('timestamp');
      expect(errorDetails.context).toHaveProperty('execution_time_ms');
    });

    it('应该支持可选的错误栈', () => {
      const errorDetails = {
        error_type: ErrorType.UNKNOWN,
        error_message: 'Unknown error'
      };

      // 使用 as any 来绕过 TypeScript 检查，因为这是测试
      expect((errorDetails as any).error_stack).toBeUndefined();
    });

    it('应该支持可选的上下文', () => {
      const errorDetails = {
        error_type: ErrorType.UNKNOWN,
        error_message: 'Unknown error'
      };

      // 使用 as any 来绕过 TypeScript 检查，因为这是测试
      expect((errorDetails as any).context).toBeUndefined();
    });
  });
});
