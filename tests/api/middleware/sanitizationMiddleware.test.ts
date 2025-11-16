import { Request, Response, NextFunction } from 'express';
import {
  createSanitizationMiddleware,
  sanitizeStringValue,
  sanitizeObjectValue,
  SanitizationOptions
} from '../../../src/api/middleware/sanitizationMiddleware';

describe('Sanitization Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockRequest = {
      body: {},
      query: {},
      params: {},
      headers: {},
      path: '/test',
      method: 'POST'
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      locals: {}
    } as any;

    mockNext = jest.fn();
  });

  describe('sanitizeStringValue', () => {
    it('should remove HTML tags', () => {
      const options: SanitizationOptions = {
        allowHtml: false
      };

      const input = '<script>alert("XSS")</script>Hello';
      const result = sanitizeStringValue(input, options);

      expect(result).toBe('alert("XSS")Hello');
    });

    it('should prevent SQL injection', () => {
      const options: SanitizationOptions = {
        preventSqlInjection: true
      };

      const input = "test'; DROP TABLE users; --";
      const result = sanitizeStringValue(input, options);

      expect(result).toBe("test DROP TABLE users ");
    });

    it('should prevent command injection', () => {
      const options: SanitizationOptions = {
        preventCommandInjection: true
      };

      const input = 'test && rm -rf /';
      const result = sanitizeStringValue(input, options);

      // 移除 &，保留 -rf /（- 是正常的命令行参数）
      expect(result).toBe('test  rm -rf /');
    });

    it('should prevent path traversal', () => {
      const options: SanitizationOptions = {
        preventPathTraversal: true
      };

      const input = '../../../etc/passwd';
      const result = sanitizeStringValue(input, options);

      // 移除 .. 后，清理多个斜杠，结果应该是 /etc/passwd
      expect(result).toBe('/etc/passwd');
    });

    it('should skip fields in skipFields list when used in object context', () => {
      const options: SanitizationOptions = {
        skipFields: ['password'],
        preventSqlInjection: true
      };

      const input = {
        username: "test'; DROP TABLE users; --",
        password: "test'; DROP TABLE users; --"
      };

      const result = sanitizeObjectValue(input, options);

      expect(result.username).toBe("test DROP TABLE users ");
      expect(result.password).toBe("test'; DROP TABLE users; --"); // 应该保持不变
    });
  });

  describe('sanitizeObjectValue', () => {
    it('should sanitize nested objects', () => {
      const options: SanitizationOptions = {
        preventSqlInjection: true,
        preventCommandInjection: true
      };

      const input = {
        name: "test'; DROP TABLE users; --",
        description: 'test && rm -rf /',
        nested: {
          value: '<script>alert("XSS")</script>'
        }
      };

      const result = sanitizeObjectValue(input, options);

      expect(result.name).toBe("test DROP TABLE users ");
      // 移除 &，保留 -rf /（- 是正常的命令行参数）
      expect(result.description).toBe('test  rm -rf /');
      // HTML 清理会移除 <script> 标签，但保留内容
      // SQL 清理会移除双引号，变成 alert(XSS)
      // 命令注入清理会移除括号，变成 alertXSS
      expect(result.nested.value).toBe('alertXSS');
    });

    it('should sanitize arrays', () => {
      const options: SanitizationOptions = {
        preventSqlInjection: true
      };

      const input = {
        items: [
          "test'; DROP TABLE users; --",
          'normal value'
        ]
      };

      const result = sanitizeObjectValue(input, options);

      expect(result.items[0]).toBe("test DROP TABLE users ");
      expect(result.items[1]).toBe('normal value');
    });
  });

  describe('createSanitizationMiddleware', () => {
    it('should sanitize request body', () => {
      const options: SanitizationOptions = {
        sanitizeBody: true,
        preventSqlInjection: true
      };

      mockRequest.body = {
        name: "test'; DROP TABLE users; --"
      };

      const middleware = createSanitizationMiddleware(options);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.body.name).toBe("test DROP TABLE users ");
    });

    it('should sanitize query parameters', () => {
      const options: SanitizationOptions = {
        sanitizeQuery: true,
        preventCommandInjection: true
      };

      mockRequest.query = {
        search: 'test && rm -rf /'
      };

      const middleware = createSanitizationMiddleware(options);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.query.search).toBe('test  rm -rf /');
    });

    it('should sanitize path parameters', () => {
      const options: SanitizationOptions = {
        sanitizeParams: true,
        preventPathTraversal: true
      };

      mockRequest.params = {
        id: '../../../etc/passwd'
      };

      const middleware = createSanitizationMiddleware(options);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      // 移除 .. 后，清理多个斜杠，结果应该是 /etc/passwd
      expect(mockRequest.params.id).toBe('/etc/passwd');
    });

    it('should skip sanitization for skipFields', () => {
      const options: SanitizationOptions = {
        sanitizeBody: true,
        preventSqlInjection: true,
        skipFields: ['password']
      };

      mockRequest.body = {
        username: "test'; DROP TABLE users; --",
        password: "test'; DROP TABLE users; --"
      };

      const middleware = createSanitizationMiddleware(options);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.body.username).toBe("test DROP TABLE users ");
      expect(mockRequest.body.password).toBe("test'; DROP TABLE users; --"); // 应该保持不变
    });

    it('should handle errors gracefully', () => {
      const options: SanitizationOptions = {
        sanitizeBody: true
      };

      // 创建一个会导致错误的对象（循环引用）
      const circular: any = { name: 'test' };
      circular.self = circular;

      mockRequest.body = circular;

      const middleware = createSanitizationMiddleware(options);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // 即使发生错误，也应该继续处理
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
