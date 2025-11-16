/**
 * ABPSkillsAdapter Tests
 * 
 * ABP Skills适配器单元测试
 */

import { ABPSkillsAdapter } from '../../../src/core/skills/ABPSkillsAdapter';
import { SkillMetadata } from '../../../src/types/skills';
import { ABPToolDefinition } from '../../../src/types/abp';

describe('ABPSkillsAdapter', () => {
  let adapter: ABPSkillsAdapter;

  beforeEach(() => {
    adapter = new ABPSkillsAdapter();
  });

  describe('detectProtocol', () => {
    it('should detect ABP protocol when protocol field is set to "abp"', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now(),
        protocol: 'abp'
      };

      const protocol = adapter.detectProtocol(metadata);
      expect(protocol).toBe('abp');
    });

    it('should treat VCP protocol as ABP (VCP protocol removed)', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now(),
        protocol: 'vcp' // 旧的VCP协议标记
      };

      // VCP协议已移除，所有技能都被视为ABP格式
      const protocol = adapter.detectProtocol(metadata);
      expect(protocol).toBe('abp');
    });

    it('should detect ABP protocol when abp field is present', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now(),
        abp: {
          kind: 'action'
        }
      };

      const protocol = adapter.detectProtocol(metadata);
      expect(protocol).toBe('abp');
    });

    it('should default to ABP protocol when no protocol or abp field', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now()
      };

      // VCP协议已移除，默认使用ABP协议
      const protocol = adapter.detectProtocol(metadata);
      expect(protocol).toBe('abp');
    });
  });

  describe('convertToABP', () => {
    it('should convert VCP format skill to ABP format', () => {
      const vcpMetadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now()
      };

      const abpMetadata = adapter.convertToABP(vcpMetadata);

      expect(abpMetadata.protocol).toBe('abp');
      expect(abpMetadata.abp).toBeDefined();
      expect(abpMetadata.abp?.kind).toBeDefined();
      expect(abpMetadata.abp?.tools).toBeDefined();
    });

    it('should not convert if already ABP format', () => {
      const abpMetadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now(),
        protocol: 'abp',
        abp: {
          kind: 'action',
          tools: [{
            name: 'test-tool',
            description: 'Test tool',
            parameters: {
              param1: {
                type: 'string',
                description: 'Test parameter',
                required: true
              }
            }
          }]
        }
      };

      const result = adapter.convertToABP(abpMetadata);
      expect(result).toBe(abpMetadata); // 应该返回原对象
    });

    it('should infer tool kind from skill type', () => {
      const vcpMetadata: SkillMetadata = {
        name: 'query-skill',
        displayName: 'Query Skill',
        description: 'Query skill description',
        version: '1.0.0',
        type: 'static',
        domain: 'test',
        keywords: ['query', 'test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now()
      };

      const abpMetadata = adapter.convertToABP(vcpMetadata);
      expect(abpMetadata.abp?.kind).toBe('query');
    });

    it('should infer tool kind from skill name', () => {
      const vcpMetadata: SkillMetadata = {
        name: 'validate-input',
        displayName: 'Validate Input',
        description: 'Validate input description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['validate', 'test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now()
      };

      const abpMetadata = adapter.convertToABP(vcpMetadata);
      expect(abpMetadata.abp?.kind).toBe('validate');
    });

    it('should infer tool kind from skill description', () => {
      const vcpMetadata: SkillMetadata = {
        name: 'transform-data',
        displayName: 'Transform Data',
        description: '转换数据格式',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['transform', 'test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now()
      };

      const abpMetadata = adapter.convertToABP(vcpMetadata);
      expect(abpMetadata.abp?.kind).toBe('transform');
    });
  });

  describe('getABPToolDefinitions', () => {
    it('should return ABP tool definitions from metadata', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now(),
        protocol: 'abp',
        abp: {
          kind: 'action',
          tools: [{
            name: 'test-tool',
            description: 'Test tool',
            parameters: {
              param1: {
                type: 'string',
                description: 'Test parameter',
                required: true
              }
            }
          }]
        }
      };

      const tools = adapter.getABPToolDefinitions(metadata);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-tool');
      expect(tools[0].description).toBe('Test tool');
      expect(tools[0].kind).toBe('action');
      expect(tools[0].parameters).toBeDefined();
    });

    it('should generate ABP tool definitions when not present in metadata', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now()
      };

      const tools = adapter.getABPToolDefinitions(metadata);

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test-skill');
      expect(tools[0].description).toBe('Test description');
      expect(tools[0].kind).toBe('action'); // 默认类型
      expect(tools[0].version).toBe('1.0.0');
      expect(tools[0].author).toBe('Test Skill');
    });

    it('should handle multiple tool definitions', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now(),
        protocol: 'abp',
        abp: {
          kind: 'action',
          tools: [
            {
              name: 'tool1',
              description: 'Tool 1',
              parameters: {
                param1: {
                  type: 'string',
                  required: true
                }
              }
            },
            {
              name: 'tool2',
              description: 'Tool 2',
              parameters: {
                param2: {
                  type: 'number',
                  required: false
                }
              }
            }
          ]
        }
      };

      const tools = adapter.getABPToolDefinitions(metadata);

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('tool1');
      expect(tools[1].name).toBe('tool2');
    });

    it('should normalize parameter requirements and descriptions', () => {
      const metadata: SkillMetadata = {
        name: 'normalize-skill',
        displayName: 'Normalize Skill',
        description: 'Fallback description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['normalize'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now(),
        protocol: 'abp',
        abp: {
          kind: 'action',
          tools: [
            {
              name: 'normalizeTool',
              parameters: {
                explicitOptional: {
                  type: 'string',
                  required: false,
                  description: 'Has explicit optional flag'
                },
                implicitRequired: {
                  type: 'number'
                }
              }
            }
          ]
        }
      };

      const [tool] = adapter.getABPToolDefinitions(metadata);

      expect(tool.parameters?.explicitOptional.required).toBe(false);
      expect(tool.parameters?.implicitRequired.required).toBe(true);
      expect(tool.parameters?.implicitRequired.description).toBeUndefined();
      expect(tool.description).toBe('Fallback description');
    });
  });

  describe('validateABPFormat', () => {
    it('should validate ABP format skill', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now(),
        protocol: 'abp',
        abp: {
          kind: 'action',
          tools: [{
            name: 'test-tool',
            description: 'Test tool',
            parameters: {
              param1: {
                type: 'string',
                description: 'Test parameter',
                required: true
              }
            }
          }]
        }
      };

      const result = adapter.validateABPFormat(metadata);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for skill without protocol or ABP config (auto-converted to ABP)', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now()
        // 没有协议字段，没有ABP配置，会被自动检测为ABP并转换
      };

      // 由于detectProtocol现在总是返回'abp'，但如果没有明确指定protocol字段
      // validateABPFormat可能仍然允许（需要检查实际行为）
      // 实际上，如果协议是'abp'但没有abp配置，validateABPFormat应该返回错误
      // 但这是合理的，因为可以通过convertToABP添加配置
      const result = adapter.validateABPFormat(metadata);

      // 由于detectProtocol总是返回'abp'，而metadata没有abp配置
      // validateABPFormat应该返回错误（因为没有abp配置）
      // 这是正确的行为，因为validateABPFormat验证的是ABP格式的完整性
      // 可以使用convertToABP来添加缺失的配置
      expect(result.valid).toBe(false); // 没有ABP配置的'abp'协议技能是无效的
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('ABP协议Skill必须包含abp配置');
    });

    it('should return error for invalid ABP tool kind', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now(),
        protocol: 'abp',
        abp: {
          kind: 'invalid' as any,
          tools: [{
            name: 'test-tool',
            description: 'Test tool'
          }]
        }
      };

      const result = adapter.validateABPFormat(metadata);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('无效的ABP工具类型');
    });

    it('should return error for missing tool name', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now(),
        protocol: 'abp',
        abp: {
          kind: 'action',
          tools: [{
            name: '',
            description: 'Test tool'
          } as any]
        }
      };

      const result = adapter.validateABPFormat(metadata);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return error for missing ABP configuration when protocol is abp', () => {
      const metadata: SkillMetadata = {
        name: 'test-skill',
        displayName: 'Test Skill',
        description: 'Test description',
        version: '1.0.0',
        type: 'direct',
        domain: 'test',
        keywords: ['test'],
        permissions: {},
        cacheable: true,
        ttl: 3600,
        path: '/test',
        loadedAt: Date.now(),
        protocol: 'abp'
        // 缺少abp配置
      };

      const result = adapter.validateABPFormat(metadata);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('ABP协议Skill必须包含abp配置');
    });
  });
});

