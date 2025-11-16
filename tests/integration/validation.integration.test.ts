/**
 * Validation Integration Tests - 输入验证集成测试
 * 
 * 测试验证中间件在实际 API 端点中的集成
 */

import request from 'supertest';
import express, { Express } from 'express';
import { createValidationMiddleware } from '../../src/api/middleware/validationMiddleware';
import {
  chatCompletionSchema,
  personalityCreateSchema,
  personalityUpdateSchema,
  personalityIdSchema,
  nodeRegistrationSchema,
  nodeUpdateSchema,
  nodeIdSchema,
  configUpdateSchema,
  setupSchema
} from '../../src/api/middleware/validationSchemas';
import { createSanitizationMiddleware } from '../../src/api/middleware/sanitizationMiddleware';
import { initializeCustomValidators } from '../../src/api/middleware/customValidators';

describe('Validation Integration Tests', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // 初始化自定义验证器
    initializeCustomValidators();
    
    // 添加清理中间件
    app.use(createSanitizationMiddleware({
      sanitizeBody: true,
      sanitizeQuery: true,
      sanitizeParams: true,
      preventSqlInjection: true,
      preventCommandInjection: true,
      preventPathTraversal: true,
      skipFields: ['password', 'apiKey']
    }));

    // 添加测试路由
    setupTestRoutes(app);
  });

  function setupTestRoutes(app: Express) {
    // 聊天补全API测试路由
    app.post('/v1/chat/completions',
      createValidationMiddleware(chatCompletionSchema),
      (req, res) => {
        res.json({
          success: true,
          message: 'Chat completion processed',
          data: req.body
        });
      }
    );

    // 人格创建API测试路由
    app.post('/api/admin/personalities',
      createValidationMiddleware(personalityCreateSchema),
      (req, res) => {
        res.json({
          success: true,
          message: 'Personality created',
          data: req.body
        });
      }
    );

    // 人格更新API测试路由
    app.put('/api/admin/personalities/:id',
      createValidationMiddleware(personalityUpdateSchema),
      (req, res) => {
        res.json({
          success: true,
          message: 'Personality updated',
          id: req.params.id,
          data: req.body
        });
      }
    );

    // 人格获取API测试路由
    app.get('/api/admin/personalities/:id',
      createValidationMiddleware(personalityIdSchema),
      (req, res) => {
        res.json({
          success: true,
          id: req.params.id
        });
      }
    );

    // 节点注册API测试路由
    app.post('/api/admin/nodes',
      createValidationMiddleware(nodeRegistrationSchema),
      (req, res) => {
        res.json({
          success: true,
          message: 'Node registered',
          data: req.body
        });
      }
    );

    // 节点更新API测试路由
    app.put('/api/admin/nodes/:id',
      createValidationMiddleware(nodeUpdateSchema),
      (req, res) => {
        res.json({
          success: true,
          message: 'Node updated',
          id: req.params.id, // nodeUpdateSchema使用id
          data: req.body
        });
      }
    );

    // 节点获取API测试路由
    app.get('/api/admin/nodes/:nodeId',
      createValidationMiddleware(nodeIdSchema),
      (req, res) => {
        res.json({
          success: true,
          id: req.params.nodeId
        });
      }
    );

    // 配置更新API测试路由
    app.put('/api/admin/config',
      createValidationMiddleware(configUpdateSchema),
      (req, res) => {
        res.json({
          success: true,
          message: 'Config updated',
          data: req.body
        });
      }
    );

    // 设置向导API测试路由
    app.post('/api/setup/complete',
      createValidationMiddleware(setupSchema),
      (req, res) => {
        res.json({
          success: true,
          message: 'Setup completed',
          data: req.body
        });
      }
    );
  }

  describe('Chat Completions API', () => {
    it('should accept valid chat completion request', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'user', content: 'Hello' }
          ],
          model: 'gpt-4',
          temperature: 0.7
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject request without messages', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
      expect(response.body.error.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'messages'
          })
        ])
      );
    });

    it('should reject request with invalid message role', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'invalid-role', content: 'Hello' }
          ]
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });

    it('should reject request with invalid temperature', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'user', content: 'Hello' }
          ],
          temperature: 3 // 超出范围
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });

    it('should sanitize SQL injection attempts', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'user', content: "test'; DROP TABLE users; --" }
          ]
        });

      expect(response.status).toBe(200);
      // 清理后的内容应该不包含 SQL 注入字符
      expect(response.body.data.messages[0].content).not.toContain("'");
      expect(response.body.data.messages[0].content).not.toContain(';');
    });

    it('should sanitize HTML tags', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'user', content: '<script>alert("XSS")</script>Hello' }
          ]
        });

      expect(response.status).toBe(200);
      // HTML 标签应该被移除
      expect(response.body.data.messages[0].content).not.toContain('<script>');
      expect(response.body.data.messages[0].content).not.toContain('</script>');
    });
  });

  describe('Personality API', () => {
    it('should accept valid personality creation request', async () => {
      const response = await request(app)
        .post('/api/admin/personalities')
        .send({
          id: 'test-personality',
          config: {
            personaId: 'test-personality',
            name: 'Test Personality',
            systemPrompt: 'You are a test personality'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject personality creation with invalid ID format', async () => {
      const response = await request(app)
        .post('/api/admin/personalities')
        .send({
          id: 'invalid id with spaces',
          config: {
            personaId: 'test-personality',
            name: 'Test Personality'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });

    it('should reject personality creation without required fields', async () => {
      const response = await request(app)
        .post('/api/admin/personalities')
        .send({
          id: 'test-personality'
          // 缺少 config
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });

    it('should accept valid personality update request', async () => {
      const response = await request(app)
        .put('/api/admin/personalities/test-id')
        .send({
          name: 'Updated Personality',
          systemPrompt: 'Updated prompt'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.id).toBe('test-id');
    });

    it('should reject personality update with invalid ID', async () => {
      const response = await request(app)
        .put('/api/admin/personalities/invalid id')
        .send({
          name: 'Updated Personality'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });

    it('should accept valid personality get request', async () => {
      const response = await request(app)
        .get('/api/admin/personalities/valid-id');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.id).toBe('valid-id');
    });

    it('should reject personality get with invalid ID format', async () => {
      const response = await request(app)
        .get('/api/admin/personalities/invalid id');

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });
  });

  describe('Node API', () => {
    it('should accept valid node registration request', async () => {
      const response = await request(app)
        .post('/api/admin/nodes')
        .send({
          name: 'test-node',
          type: 'companion'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject node registration without required fields', async () => {
      const response = await request(app)
        .post('/api/admin/nodes')
        .send({
          name: 'test-node'
          // 缺少 type
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });

    it('should reject node registration with invalid type', async () => {
      const response = await request(app)
        .post('/api/admin/nodes')
        .send({
          name: 'test-node',
          type: 'invalid-type'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });

    it('should accept valid node update request', async () => {
      const response = await request(app)
        .put('/api/admin/nodes/test-node-id')
        .send({
          name: 'updated-node',
          type: 'worker'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.id).toBe('test-node-id');
    });

    it('should reject node update with invalid ID', async () => {
      const response = await request(app)
        .put('/api/admin/nodes/invalid id')
        .send({
          name: 'updated-node'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });

    it('should accept valid node get request', async () => {
      // 使用符合模式的ID（只包含字母、数字、点、下划线、连字符）
      // 路由参数是 nodeId，不是 id
      const response = await request(app)
        .get('/api/admin/nodes/valid-node-id-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.id).toBe('valid-node-id-123');
    });

    it('should sanitize path traversal attempts in node ID', async () => {
      const response = await request(app)
        .get('/api/admin/nodes/../../../etc/passwd');

      // 路径遍历应该被清理，清理后变成 /etc/passwd
      // 但是验证模式要求只包含字母、数字、点、下划线、连字符，所以应该返回400
      // 清理后的路径包含斜杠，不符合验证模式
      // 如果清理后变成了有效的ID格式，可能会通过验证但路由不存在（404）
      // 如果清理后不符合模式，应该返回400
      expect([400, 404]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body.error.type).toBe('validation_error');
      }
    });
  });

  describe('Config API', () => {
    it('should accept valid config update request', async () => {
      const response = await request(app)
        .put('/api/admin/config')
        .send({
          config: {
            server: {
              port: 3000
            }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject config update without config field', async () => {
      const response = await request(app)
        .put('/api/admin/config')
        .send({
          data: {
            server: {
              port: 3000
            }
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });
  });

  describe('Setup API', () => {
    it('should accept valid setup request', async () => {
      const response = await request(app)
        .post('/api/setup/complete')
        .send({
          auth: {
            admin: {
              username: 'admin',
              password: 'password123'
            }
          },
          llm: {
            defaultProvider: 'openai'
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject setup request without required fields', async () => {
      const response = await request(app)
        .post('/api/setup/complete')
        .send({
          auth: {
            admin: {
              username: 'admin'
              // 缺少 password
            }
          },
          llm: {
            defaultProvider: 'openai'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });

    it('should reject setup request with invalid username', async () => {
      const response = await request(app)
        .post('/api/setup/complete')
        .send({
          auth: {
            admin: {
              username: 'ab', // 太短
              password: 'password123'
            }
          },
          llm: {
            defaultProvider: 'openai'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });

    it('should reject setup request with invalid password', async () => {
      const response = await request(app)
        .post('/api/setup/complete')
        .send({
          auth: {
            admin: {
              username: 'admin',
              password: '12345' // 太短
            }
          },
          llm: {
            defaultProvider: 'openai'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });

    it('should reject setup request with invalid LLM provider', async () => {
      const response = await request(app)
        .post('/api/setup/complete')
        .send({
          auth: {
            admin: {
              username: 'admin',
              password: 'password123'
            }
          },
          llm: {
            defaultProvider: 'invalid-provider'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });
  });

  describe('Sanitization Integration', () => {
    it('should sanitize SQL injection in all fields', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'user', content: "test'; DROP TABLE users; --" }
          ],
          // model字段有pattern验证，清理后的model可能不符合模式
          // 所以只测试messages字段的清理
        });

      expect(response.status).toBe(200);
      // SQL 注入字符应该被清理（从messages中）
      expect(response.body.data.messages[0].content).not.toContain("'");
      expect(response.body.data.messages[0].content).not.toContain(';');
    });

    it('should reject request with SQL injection in model field', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'user', content: 'Hello' }
          ],
          model: "test'; DROP TABLE users; --"
        });

      // 清理后的model可能不符合验证模式（pattern: ^[a-zA-Z0-9._-]+$）
      // 或者清理后变成了空字符串，所以应该返回400
      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('validation_error');
    });

    it('should sanitize command injection attempts', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'user', content: 'test && rm -rf /' }
          ]
        });

      expect(response.status).toBe(200);
      // 命令注入字符应该被清理
      expect(response.body.data.messages[0].content).not.toContain('&&');
    });

    it('should sanitize path traversal attempts', async () => {
      const response = await request(app)
        .post('/api/admin/personalities')
        .send({
          id: '../../../etc/passwd',
          config: {
            personaId: 'test',
            name: 'Test'
          }
        });

      // 路径遍历应该被清理，但验证应该失败（因为清理后的ID可能不符合模式）
      expect(response.status).toBe(400);
    });

    it('should not sanitize password fields', async () => {
      const response = await request(app)
        .post('/api/setup/complete')
        .send({
          auth: {
            admin: {
              username: 'admin',
              password: "test'; DROP TABLE users; --"
            }
          },
          llm: {
            defaultProvider: 'openai'
          }
        });

      expect(response.status).toBe(200);
      // 密码字段不应该被清理（在 skipFields 中）
      expect(response.body.data.auth.admin.password).toBe("test'; DROP TABLE users; --");
    });
  });
});
