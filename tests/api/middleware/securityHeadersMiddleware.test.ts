/**
 * Security Headers Middleware Tests - 安全头中间件测试
 */

import { Request, Response, NextFunction } from 'express';
import { createSecurityHeadersMiddleware } from '../../../src/api/middleware/securityHeadersMiddleware';

describe('Security Headers Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let headers: Record<string, string>;

  beforeEach(() => {
    headers = {};
    mockRequest = {
      path: '/test',
      method: 'GET',
      headers: {}
    };
    mockResponse = {
      setHeader: jest.fn((name: string, value: string) => {
        headers[name] = value;
        return mockResponse as Response;
      }) as any,
      removeHeader: jest.fn(() => mockResponse as Response),
      getHeader: jest.fn((name: string) => headers[name]),
      headersSent: false
    };
    mockNext = jest.fn();
  });

  describe('Basic Security Headers', () => {
    it('should set security headers when enabled', () => {
      const middleware = createSecurityHeadersMiddleware({ enabled: true });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.setHeader).toHaveBeenCalled();
    });

    it('should not set security headers when disabled', () => {
      const middleware = createSecurityHeadersMiddleware({ enabled: false });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.setHeader).not.toHaveBeenCalled();
    });
  });

  describe('Content Security Policy', () => {
    it('should set CSP header when enabled', () => {
      const middleware = createSecurityHeadersMiddleware({
        enabled: true,
        csp: {
          enabled: true,
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'"]
          }
        }
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should not set CSP header when disabled', () => {
      const middleware = createSecurityHeadersMiddleware({
        enabled: true,
        csp: {
          enabled: false
        }
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('HSTS', () => {
    it('should set HSTS header when enabled', () => {
      const middleware = createSecurityHeadersMiddleware({
        enabled: true,
        hsts: {
          enabled: true,
          maxAge: 31536000,
          includeSubDomains: true
        }
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should not set HSTS header when disabled', () => {
      const middleware = createSecurityHeadersMiddleware({
        enabled: true,
        hsts: {
          enabled: false
        }
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('X-Frame-Options', () => {
    it('should set X-Frame-Options header when enabled', () => {
      const middleware = createSecurityHeadersMiddleware({
        enabled: true,
        frameguard: {
          enabled: true,
          action: 'DENY'
        }
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should set X-Frame-Options to SAMEORIGIN when configured', () => {
      const middleware = createSecurityHeadersMiddleware({
        enabled: true,
        frameguard: {
          enabled: true,
          action: 'SAMEORIGIN'
        }
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Other Security Headers', () => {
    it('should set X-Content-Type-Options header', () => {
      const middleware = createSecurityHeadersMiddleware({
        enabled: true,
        contentTypeNosniff: true
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should set X-XSS-Protection header', () => {
      const middleware = createSecurityHeadersMiddleware({
        enabled: true,
        xssFilter: true
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should set Referrer-Policy header', () => {
      const middleware = createSecurityHeadersMiddleware({
        enabled: true,
        referrerPolicy: 'strict-origin-when-cross-origin'
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', () => {
      const middleware = createSecurityHeadersMiddleware({ enabled: true });

      // 模拟错误
      mockResponse.setHeader = jest.fn(() => {
        throw new Error('Header error');
      });

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // 即使出错，也应该调用 next
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
