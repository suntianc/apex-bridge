import { Request, Response, NextFunction } from 'express';
import {
  createValidationMiddleware,
  validateBody,
  validateQuery,
  validateParams,
  ValidationSchema,
  ValidationOptions,
  clearValidatorCache
} from '../../../src/api/middleware/validationMiddleware';

describe('Validation Middleware', () => {
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
    clearValidatorCache();
  });

  describe('validateBody', () => {
    it('should pass validation for valid body', async () => {
      const schema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            minLength: 1
          },
          age: {
            type: 'number',
            minimum: 0
          }
        }
      };

      mockRequest.body = {
        name: 'Test',
        age: 25
      };

      const middleware = validateBody(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject validation for invalid body', async () => {
      const schema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            minLength: 1
          }
        }
      };

      mockRequest.body = {
        age: 25
      };

      const middleware = validateBody(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          message: '请求验证失败',
          type: 'validation_error',
          code: 'validation_failed',
          errors: expect.arrayContaining([
            expect.objectContaining({
              field: 'name',
              message: expect.any(String)
            })
          ])
        }
      });
    });

    it('should apply default values', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            default: 'Default Name'
          },
          age: {
            type: 'number',
            default: 18
          }
        }
      };

      mockRequest.body = {};

      const middleware = validateBody(schema, { useDefaults: true });
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.body).toEqual({
        name: 'Default Name',
        age: 18
      });
    });
  });

  describe('validateQuery', () => {
    it('should pass validation for valid query', async () => {
      const schema = {
        type: 'object',
        properties: {
          page: {
            type: 'integer',
            minimum: 1
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100
          }
        }
      };

      mockRequest.query = {
        page: '1',
        limit: '20'
      };

      const middleware = validateQuery(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject validation for invalid query', async () => {
      const schema = {
        type: 'object',
        properties: {
          page: {
            type: 'integer',
            minimum: 1
          }
        }
      };

      mockRequest.query = {
        page: '-1'
      };

      const middleware = validateQuery(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateParams', () => {
    it('should pass validation for valid params', async () => {
      const schema = {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            pattern: '^[a-zA-Z0-9._-]+$'
          }
        }
      };

      mockRequest.params = {
        id: 'test-id-123'
      };

      const middleware = validateParams(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject validation for invalid params', async () => {
      const schema = {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            pattern: '^[a-zA-Z0-9._-]+$'
          }
        }
      };

      mockRequest.params = {
        id: 'invalid id with spaces'
      };

      const middleware = validateParams(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('createValidationMiddleware', () => {
    it('should validate multiple sources', async () => {
      const schema: ValidationSchema = {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string'
            }
          }
        },
        query: {
          type: 'object',
          properties: {
            page: {
              type: 'integer',
              minimum: 1
            }
          }
        },
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: {
              type: 'string'
            }
          }
        }
      };

      mockRequest.body = { name: 'Test' };
      mockRequest.query = { page: '1' };
      mockRequest.params = { id: 'test-id' };

      const middleware = createValidationMiddleware(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should collect errors from all sources', async () => {
      const schema: ValidationSchema = {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string'
            }
          }
        },
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: {
              type: 'string'
            }
          }
        }
      };

      mockRequest.body = {};
      mockRequest.params = {};

      const middleware = createValidationMiddleware(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          message: '请求验证失败',
          type: 'validation_error',
          code: 'validation_failed',
          errors: expect.arrayContaining([
            expect.objectContaining({
              field: expect.stringContaining('name')
            }),
            expect.objectContaining({
              field: expect.stringContaining('id')
            })
          ])
        }
      });
    });

    it('should continue on error when continueOnError is true', async () => {
      const schema: ValidationSchema = {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string'
            }
          }
        }
      };

      const options: ValidationOptions = {
        continueOnError: true
      };

      mockRequest.body = {};

      const middleware = createValidationMiddleware(schema, options);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });

  describe('validator caching', () => {
    it('should cache validators', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: {
            type: 'string'
          }
        }
      };

      mockRequest.body = { name: 'Test' };

      const middleware1 = validateBody(schema);
      await middleware1(mockRequest as Request, mockResponse as Response, mockNext);

      mockNext.mockClear();

      const middleware2 = validateBody(schema);
      await middleware2(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle validation errors gracefully', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            minLength: 5
          }
        }
      };

      mockRequest.body = {
        name: 'Test' // 长度不足
      };

      const middleware = validateBody(schema);
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          message: '请求验证失败',
          type: 'validation_error',
          code: 'validation_failed',
          errors: expect.arrayContaining([
            expect.objectContaining({
              field: 'name',
              message: expect.stringContaining('长度')
            })
          ])
        }
      });
    });
});
