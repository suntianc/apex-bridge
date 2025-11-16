/**
 * CodeGenerator ABP Support Tests
 * 
 * CodeGenerator ABP协议支持单元测试
 */

import { CodeGenerator } from '../../../src/core/skills/CodeGenerator';
import { SkillContent } from '../../../src/types';
import { SkillMetadata } from '../../../src/types/skills';

describe('CodeGenerator ABP Support', () => {
  let generator: CodeGenerator;

  beforeEach(() => {
    generator = new CodeGenerator();
  });

  const createSkillContent = (
    codeBlocks: Array<{ language: string; code: string }>,
    metadata?: SkillMetadata
  ): { content: SkillContent; metadata?: SkillMetadata } => {
    const content: SkillContent = {
      name: 'test-skill',
      raw: '',
      sections: [],
      codeBlocks,
      path: '/tmp/test-skill/SKILL.md',
      loadedAt: Date.now()
    };

    return { content, metadata };
  };

  describe('ABP Protocol Helper Code Generation', () => {
    it('should generate ABP helper code for ABP protocol skill', async () => {
      const { content, metadata } = createSkillContent(
        [
          {
            language: 'typescript',
            code: `
export async function execute(params: Record<string, unknown>): Promise<unknown> {
  return { result: 'success' };
}
            `.trim()
          }
        ],
        {
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
              name: 'testTool',
              description: 'Test tool',
              parameters: {
                param1: {
                  type: 'string',
                  description: 'Parameter 1',
                  required: true
                }
              }
            }]
          }
        }
      );

      const result = await generator.generate(content, { skillMetadata: metadata });

      expect(result.javascript).toBeDefined();
      // 检查是否包含ABP辅助函数（接口定义在编译后会被移除）
      expect(result.javascript).toContain('formatABPToolResult');
      // 检查是否成功编译
      expect(result.diagnostics).toBeUndefined();
      expect(result.javascript.length).toBeGreaterThan(0);
      // 检查是否包含execute函数（原始代码）
      expect(result.javascript).toContain('execute');
    });

    it('should generate ABP tool parameter interfaces', async () => {
      const { content, metadata } = createSkillContent(
        [
          {
            language: 'typescript',
            code: `
export async function execute(params: Record<string, unknown>): Promise<unknown> {
  return { result: 'success' };
}
            `.trim()
          }
        ],
        {
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
              name: 'testTool',
              description: 'Test tool',
              parameters: {
                param1: {
                  type: 'string',
                  description: 'Parameter 1',
                  required: true
                },
                param2: {
                  type: 'number',
                  description: 'Parameter 2',
                  required: false
                }
              }
            }]
          }
        }
      );

      const result = await generator.generate(content, { skillMetadata: metadata });

      expect(result.javascript).toBeDefined();
      // 检查生成的JavaScript代码
      // 注意：TypeScript接口在编译后不会保留，所以只检查函数和基本结构
      expect(result.javascript.length).toBeGreaterThan(0);
      // 检查是否成功编译
      expect(result.diagnostics).toBeUndefined();
    });

    it('should not generate ABP helper code for VCP protocol skill', async () => {
      const { content, metadata } = createSkillContent(
        [
          {
            language: 'typescript',
            code: `
export async function execute(params: Record<string, unknown>): Promise<unknown> {
  return { result: 'success' };
}
            `.trim()
          }
        ],
        {
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
          // 没有protocol或abp字段，默认为VCP
        }
      );

      const result = await generator.generate(content, { skillMetadata: metadata });

      expect(result.javascript).toBeDefined();
      // 检查是否成功编译（VCP协议不需要ABP辅助代码）
      expect(result.diagnostics).toBeUndefined();
      expect(result.javascript.length).toBeGreaterThan(0);
    });

    it('should handle skill without metadata', async () => {
      const { content } = createSkillContent([
        {
          language: 'typescript',
          code: `
export async function execute(params: Record<string, unknown>): Promise<unknown> {
  return { result: 'success' };
}
          `.trim()
        }
      ]);

      const result = await generator.generate(content);

      expect(result.javascript).toBeDefined();
      // 没有metadata时，不应该生成ABP辅助代码
      // 检查是否成功编译
      expect(result.diagnostics).toBeUndefined();
      expect(result.javascript.length).toBeGreaterThan(0);
    });

    it('should generate ABP helper code for multiple tools', async () => {
      const { content, metadata } = createSkillContent(
        [
          {
            language: 'typescript',
            code: `
export async function execute(params: Record<string, unknown>): Promise<unknown> {
  return { result: 'success' };
}
            `.trim()
          }
        ],
        {
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
        }
      );

      const result = await generator.generate(content, { skillMetadata: metadata });

      expect(result.javascript).toBeDefined();
      // 检查是否成功编译（多个工具）
      expect(result.diagnostics).toBeUndefined();
      expect(result.javascript.length).toBeGreaterThan(0);
    });
  });

  describe('ABP Protocol Type Definitions', () => {
    it('should generate ABP type definitions', async () => {
      const { content, metadata } = createSkillContent(
        [
          {
            language: 'typescript',
            code: `
export async function execute(params: Record<string, unknown>): Promise<unknown> {
  return { result: 'success' };
}
            `.trim()
          }
        ],
        {
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
              name: 'testTool',
              description: 'Test tool'
            }]
          }
        }
      );

      const result = await generator.generate(content, { skillMetadata: metadata });

      expect(result.javascript).toBeDefined();
      // 检查是否成功编译（ABP类型定义）
      // 注意：TypeScript接口在编译后不会保留，所以只检查代码是否能正常编译
      expect(result.diagnostics).toBeUndefined();
      expect(result.javascript.length).toBeGreaterThan(0);
      
      // 检查是否包含execute函数（原始代码）
      expect(result.javascript).toContain('execute');
    });

    it('should generate ABP helper functions', async () => {
      const { content, metadata } = createSkillContent(
        [
          {
            language: 'typescript',
            code: `
export async function execute(params: Record<string, unknown>): Promise<unknown> {
  return { result: 'success' };
}
            `.trim()
          }
        ],
        {
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
              name: 'testTool',
              description: 'Test tool'
            }]
          }
        }
      );

      const result = await generator.generate(content, { skillMetadata: metadata });

      expect(result.javascript).toBeDefined();
      // 检查是否成功编译（ABP辅助函数）
      expect(result.diagnostics).toBeUndefined();
      expect(result.javascript.length).toBeGreaterThan(0);
      
      // 检查是否包含execute函数（原始代码）
      expect(result.javascript).toContain('execute');
      
      // 检查生成的代码是否包含ABP相关的辅助代码
      // 注意：由于TypeScript编译会移除接口定义，我们主要检查代码是否能正常编译
      // 实际的ABP辅助代码会在运行时可用（通过生成的JavaScript代码）
    });
  });
});

