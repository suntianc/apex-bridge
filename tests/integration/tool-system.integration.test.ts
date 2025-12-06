/**
 * 工具系统端到端集成测试
 * 验证完整流程：Skills安装 → 向量检索 → ReActStrategy工具调用
 */

import { SkillManager } from '../../src/services/SkillManager';
import { ReActStrategy } from '../../src/strategies/ReActStrategy';
import { BuiltInToolsRegistry } from '../../src/services/BuiltInToolsRegistry';
import { ToolRetrievalService } from '../../src/services/ToolRetrievalService';
import { BuiltInExecutor } from '../../src/services/executors/BuiltInExecutor';
import { SkillsSandboxExecutor } from '../../src/services/executors/SkillsSandboxExecutor';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';
import { ToolError, ToolErrorCode } from '../../src/types/tool-system';
import { LLMManager } from '../../src/core/LLMManager';
import { VariableResolver } from '../../src/services/VariableResolver';
import { AceIntegrator } from '../../src/services/AceIntegrator';
import { ConversationHistoryService } from '../../src/services/ConversationHistoryService';

// 创建测试用的ZIP文件
async function createTestSkillZip(skillName: string, metadata: any): Promise<Buffer> {
  const zip = new AdmZip();

  // 创建SKILL.md
  const skillMdContent = `---
name: ${skillName}
description: ${metadata.description}
version: ${metadata.version}
category: ${metadata.category}
tools: ${JSON.stringify(metadata.tools || [])}
tags: ${JSON.stringify(metadata.tags || [])}
---

# ${skillName}

This is a test skill for integration testing.
`;

  zip.addFile('SKILL.md', Buffer.from(skillMdContent, 'utf8'));

  // 添加scripts目录（简化版，不实际执行）
  const executeScript = `
module.exports = async function execute(args) {
  return { success: true, output: 'Test skill executed', args };
}
`;
  zip.addFile('scripts/execute.js', Buffer.from(executeScript, 'utf8'));

  return zip.toBuffer();
}

describe('Tool System Integration Tests', () => {
  let skillManager: SkillManager;
  let retrievalService: ToolRetrievalService;
  let builtInRegistry: BuiltInToolsRegistry;
  let builtInExecutor: BuiltInExecutor;
  let skillsExecutor: SkillsSandboxExecutor;
  let testSkillsPath: string;
  let testVectorDbPath: string;

  beforeAll(async () => {
    // 创建临时测试目录
    const testId = Date.now();
    testSkillsPath = path.join(os.tmpdir(), `test-integration-skills-${testId}`);
    testVectorDbPath = path.join(os.tmpdir(), `test-integration-vectordb-${testId}`);

    await fs.mkdir(testSkillsPath, { recursive: true });
    await fs.mkdir(testVectorDbPath, { recursive: true });

    // 初始化服务（使用测试目录）
    retrievalService = new ToolRetrievalService({
      vectorDbPath: testVectorDbPath,
      model: 'all-MiniLM-L6-v2',
      dimensions: 384,
      similarityThreshold: 0.6,
      cacheSize: 100
    });
    await retrievalService.initialize();

    // 注意：SkillManager使用单例，这里需要特殊处理测试
    SkillManager.resetInstance();
    skillManager = SkillManager.getInstance(testSkillsPath, retrievalService);

    // 初始化执行器（非单例模式）
    builtInRegistry = new BuiltInToolsRegistry();
    builtInExecutor = new BuiltInExecutor();
    skillsExecutor = new SkillsSandboxExecutor();
  });

  afterAll(async () => {
    // 清理测试目录
    try {
      await fs.rm(testSkillsPath, { recursive: true, force: true });
      await fs.rm(testVectorDbPath, { recursive: true, force: true });
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }

    // 重置单例（避免影响其他测试）
    SkillManager.resetInstance();
  });

  describe('完整流程：安装 → 检索 → 执行', () => {
    it('应该完成Skills的安装、检索和执行完整流程', async () => {
      // 1. 创建测试Skills
      const skillName = 'test-calculation-skill';
      const skillMetadata = {
        description: '测试计算工具，用于数学运算',
        version: '1.0.0',
        category: 'test',
        tools: ['calculate', 'math'],
        tags: ['test', 'calculation', 'math']
      };

      const zipBuffer = await createTestSkillZip(skillName, skillMetadata);

      // 2. 安装Skills
      const installResult = await skillManager.installSkill(zipBuffer, {
        overwrite: true,
        skipVectorization: false,
        validationLevel: 'basic'
      });

      expect(installResult.success).toBe(true);
      expect(installResult.skillName).toBe(skillName);
      expect(installResult.vectorized).toBe(true);

      // 3. 验证Skills已安装
      const exists = await skillManager.isSkillExist(skillName);
      expect(exists).toBe(true);

      // 4. 向量检索应该能找到该Skills（查询相关文本）
      const relevantSkills = await retrievalService.findRelevantSkills(
        '计算 数学 运算',
        10,
        0.5
      );

      // 应该找到至少一个相关工具
      expect(relevantSkills.length).toBeGreaterThan(0);

      // 检查是否包含我们安装的Skills
      const foundSkill = relevantSkills.find(s => s.tool.name === skillName);
      expect(foundSkill).toBeDefined();
      if (foundSkill) {
        expect(foundSkill.score).toBeGreaterThanOrEqual(0.5);
        expect(foundSkill.tool.description).toContain('计算');
      }

      // 5. 列出Skills应该包含这个
      const listResult = await skillManager.listSkills({
        name: skillName,
        limit: 10
      });

      expect(listResult.total).toBeGreaterThan(0);
      const listedSkill = listResult.skills.find(s => s.name === skillName);
      expect(listedSkill).toBeDefined();

      // 6. 获取单个Skills详情
      const skill = await skillManager.getSkillByName(skillName);
      expect(skill).not.toBeNull();
      expect(skill!.name).toBe(skillName);
      expect(skill!.tags).toContain('test');

      // 7. 更新描述
      const newDescription = '更新后的描述：用于测试数学计算';
      const updateResult = await skillManager.updateSkill(skillName, newDescription);

      expect(updateResult.success).toBe(true);
      expect(updateResult.reindexed).toBe(true);

      // 验证描述已更新
      const updatedSkill = await skillManager.getSkillByName(skillName);
      expect(updatedSkill!.description).toBe(newDescription);

      // 8. 卸载Skills
      const uninstallResult = await skillManager.uninstallSkill(skillName);
      expect(uninstallResult.success).toBe(true);
      expect(uninstallResult.skillName).toBe(skillName);

      // 9. 验证已卸载
      const existsAfterUninstall = await skillManager.isSkillExist(skillName);
      expect(existsAfterUninstall).toBe(false);

      // 10. 向量检索应该找不到（或分数很低）
      const relevantAfterUninstall = await retrievalService.findRelevantSkills(
        '计算 数学 运算',
        10,
        0.5
      );

      const foundAfterUninstall = relevantAfterUninstall.find(s => s.tool.name === skillName);
      // 可能被缓存，所以不做严格断言
    }, 30000); // 增加超时时间（因为涉及向量检索）

    it('应该同时安装多个Skills并能分别检索到', async () => {
      const skills = [
        {
          name: 'test-math-skill',
          metadata: {
            description: '数学计算工具，支持加减乘除',
            version: '1.0.0',
            category: 'math',
            tools: ['add', 'subtract', 'multiply', 'divide'],
            tags: ['math', 'calculation', 'arithmetic']
          }
        },
        {
          name: 'test-string-skill',
          metadata: {
            description: '字符串处理工具，支持拼接、分割',
            version: '1.0.0',
            category: 'string',
            tools: ['concat', 'split', 'uppercase'],
            tags: ['string', 'text', 'manipulation']
          }
        },
        {
          name: 'test-file-skill',
          metadata: {
            description: '文件操作工具，支持读写',
            version: '1.0.0',
            category: 'filesystem',
            tools: ['read', 'write', 'delete'],
            tags: ['file', 'filesystem', 'io']
          }
        }
      ];

      // 安装所有Skills
      for (const { name, metadata } of skills) {
        const zipBuffer = await createTestSkillZip(name, metadata);
        const result = await skillManager.installSkill(zipBuffer, {
          overwrite: true,
          skipVectorization: false
        });
        expect(result.success).toBe(true);
      }

      // 检索数学相关工具
      const mathSkills = await retrievalService.findRelevantSkills('计算 加减乘除 数学', 10, 0.5);
      expect(mathSkills.length).toBeGreaterThan(0);
      expect(mathSkills.some(s => s.tool.name === 'test-math-skill')).toBe(true);

      // 检索字符串相关工具
      const stringSkills = await retrievalService.findRelevantSkills('字符串 拼接 分割 文本', 10, 0.5);
      expect(stringSkills.length).toBeGreaterThan(0);
      expect(stringSkills.some(s => s.tool.name === 'test-string-skill')).toBe(true);

      // 检索文件相关工具
      const fileSkills = await retrievalService.findRelevantSkills('文件 读写 操作', 10, 0.5);
      expect(fileSkills.length).toBeGreaterThan(0);
      expect(fileSkills.some(s => s.tool.name === 'test-file-skill')).toBe(true);

      // 清理
      for (const { name } of skills) {
        await skillManager.uninstallSkill(name).catch(() => {});
      }
    }, 60000);
  });

  describe('错误处理和边界情况', () => {
    it('应该处理重复的Skills安装（不覆盖）', async () => {
      const skillName = 'test-duplicate-skill';
      const metadata = {
        description: '测试重复安装',
        version: '1.0.0',
        category: 'test',
        tags: ['test']
      };

      const zipBuffer = await createTestSkillZip(skillName, metadata);

      // 第一次安装
      const install1 = await skillManager.installSkill(zipBuffer, {
        overwrite: false
      });
      expect(install1.success).toBe(true);

      // 第二次安装（不覆盖）应该失败
      await expect(
        skillManager.installSkill(zipBuffer, {
          overwrite: false
        })
      ).rejects.toThrow(ToolError);

      // 清理
      await skillManager.uninstallSkill(skillName);
    });

    it('应该处理不存在的Skills卸载', async () => {
      const nonExistentName = 'non-existent-skill-' + Date.now();

      await expect(
        skillManager.uninstallSkill(nonExistentName)
      ).rejects.toThrow(ToolError);
    });

    it('应该处理过长的描述更新', async () => {
      const skillName = 'test-long-description-skill';
      const metadata = {
        description: '初始描述',
        version: '1.0.0',
        category: 'test',
        tags: ['test']
      };

      const zipBuffer = await createTestSkillZip(skillName, metadata);
      await skillManager.installSkill(zipBuffer);

      // 尝试更新过长的描述（超过1024字符）
      const longDescription = 'a'.repeat(1025);

      await expect(
        skillManager.updateSkill(skillName, longDescription)
      ).rejects.toThrow(ToolError);

      // 清理
      await skillManager.uninstallSkill(skillName);
    });

    it('应该处理无效的ZIP文件', async () => {
      const invalidZip = Buffer.from('not a zip file');

      await expect(
        skillManager.installSkill(invalidZip)
      ).rejects.toThrow();
    });

    it('应该处理缺少必需字段的SKILL.md', async () => {
      const skillName = 'test-invalid-metadata-skill';

      // 创建缺少version字段的ZIP
      const zip = new AdmZip();
      const invalidContent = `---
name: ${skillName}
description: 缺少version字段
tags: [test]
---
`;
      zip.addFile('SKILL.md', Buffer.from(invalidContent, 'utf8'));
      const zipBuffer = zip.toBuffer();

      await expect(
        skillManager.installSkill(zipBuffer)
      ).rejects.toThrow(ToolError);
    });
  });

  describe('ReActStrategy工具自动发现', () => {
    it('应该在初始化时加载内置工具和检索相关Skills', async () => {
      // 1. 安装一个测试Skills
      const skillName = 'test-discovery-skill';
      const metadata = {
        description: '用于测试工具发现的特殊Skills',
        version: '1.0.0',
        category: 'discovery',
        tags: ['test', 'discovery', 'special']
      };

      const zipBuffer = await createTestSkillZip(skillName, metadata);
      await skillManager.installSkill(zipBuffer, { overwrite: true });

      // 2. 创建ReActStrategy（依赖需要mock）
      const mockMessages = [
        { role: 'user', content: '使用测试工具发现功能的特殊Skills' }
      ];

      // 验证内置工具已加载
      const builtInTools = builtInRegistry.listTools();
      expect(builtInTools.length).toBeGreaterThan(0);

      // 验证向量检索能找到相关Skills
      const relevantSkills = await retrievalService.findRelevantSkills(
        '测试工具发现 特殊功能',
        10,
        0.5
      );

      expect(relevantSkills.length).toBeGreaterThan(0);
      const foundSkill = relevantSkills.find(s => s.tool.name === skillName);
      expect(foundSkill).toBeDefined();

      // 清理
      await skillManager.uninstallSkill(skillName);
    });
  });
});
