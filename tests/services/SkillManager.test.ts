/**
 * SkillManager测试套件
 * 验证Skills生命周期管理功能
 */

import { SkillManager } from '../../src/services/SkillManager';
import { ToolRetrievalService } from '../../src/services/ToolRetrievalService';
import { ToolError, ToolErrorCode } from '../../src/types/tool-system';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock fs模块
jest.mock('fs/promises');
jest.mock('../../src/services/ToolRetrievalService');

describe('SkillManager', () => {
  let skillManager: SkillManager;
  let mockRetrievalService: jest.Mocked<ToolRetrievalService>;
  let testSkillsPath: string;

  beforeEach(() => {
    // 重置工厂实例
    SkillManager.resetInstance();

    // 创建模拟的检索服务
    mockRetrievalService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      indexSkill: jest.fn().mockResolvedValue(undefined),
      removeSkill: jest.fn().mockResolvedValue(undefined),
      updateSkill: jest.fn().mockResolvedValue(undefined),
      findRelevantSkills: jest.fn().mockResolvedValue([]),
      getTableStats: jest.fn()
    } as any;

    // 创建临时测试目录
    testSkillsPath = path.join(os.tmpdir(), `test-skills-${Date.now()}`);

    // 创建SkillManager实例
    skillManager = SkillManager.getInstance(testSkillsPath, mockRetrievalService);

    jest.clearAllMocks();
  });

  afterEach(async () => {
    // 清理测试目录
    try {
      await fs.rm(testSkillsPath, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  });

  describe('getInstance', () => {
    it('should return the same instance for multiple calls', () => {
      const instance1 = SkillManager.getInstance();
      const instance2 = SkillManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should allow resetting instance', () => {
      const instance1 = SkillManager.getInstance();
      SkillManager.resetInstance();
      const instance2 = SkillManager.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('validateSkillStructure (via parseSkillMetadata)', () => {
    it('should validate required fields in SKILL.md', async () => {
      const mockExists = fs.stat as unknown as jest.Mock;
      const mockReadFile = fs.readFile as unknown as jest.Mock;

      // Mock 文件存在
      mockExists.mockResolvedValue({ isFile: () => true });

      // Mock SKILL.md内容
      const validContent = `---\nname: test-skill\ndescription: A test skill\nversion: 1.0.0\ncategory: test\ntools: []\n---\n# Test Skill\n\nThis is a test skill.`;
      mockReadFile.mockResolvedValue(validContent);

      // 使用反射调用私有方法（测试目的）
      const metadata = await (skillManager as any).parseSkillMetadata('/fake/path');

      expect(metadata.name).toBe('test-skill');
      expect(metadata.description).toBe('A test skill');
      expect(metadata.version).toBe('1.0.0');
    });

    it('should throw error if SKILL.md missing required fields', async () => {
      const mockExists = fs.stat as unknown as jest.Mock;
      const mockReadFile = fs.readFile as unknown as jest.Mock;

      mockExists.mockResolvedValue({ isFile: () => true });

      // 缺少version字段
      const invalidContent = `---\nname: test-skill\ndescription: A test skill\ncategory: test\ntools: []\n---\n# Test Skill`;
      mockReadFile.mockResolvedValue(invalidContent);

      await expect((skillManager as any).parseSkillMetadata('/fake/path')).rejects.toThrow(
        ToolError
      );
    });

    it('should throw error if SKILL.md not found', async () => {
      const mockExists = fs.stat as unknown as jest.Mock;
      mockExists.mockRejectedValue(new Error('File not found'));

      await expect((skillManager as any).parseSkillMetadata('/fake/path')).rejects.toThrow(
        ToolError
      );
    });
  });

  describe('getSkillByName', () => {
    it('should return null if skill does not exist', async () => {
      const mockExists = fs.stat as unknown as jest.Mock;
      mockExists.mockRejectedValue(new Error('Directory not found'));

      const result = await skillManager.getSkillByName('non-existent');

      expect(result).toBeNull();
    });

    it('should return skill object if skill exists and is valid', async () => {
      const mockStat = fs.stat as unknown as jest.Mock;
      const mockReadFile = fs.readFile as unknown as jest.Mock;
      const mockReaddir = fs.readdir as unknown as jest.Mock;

      // Mock 目录存在
      mockStat.mockResolvedValueOnce({ isDirectory: () => true });
      // Mock 文件存在
      mockStat.mockResolvedValueOnce({ isFile: () => true });

      // Mock SKILL.md内容
      const validContent = `---\nname: test-skill\ndescription: A test skill\nversion: 1.0.0\ncategory: test\ntools: [test-tool]\ntags: [test, utility]\n---\n# Test Skill\n\nContent here.`;
      mockReadFile.mockResolvedValue(validContent);

      const result = await skillManager.getSkillByName('test-skill');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('test-skill');
      expect(result!.description).toBe('A test skill');
      expect(result!.version).toBe('1.0.0');
      expect(result!.tags).toContain('test');
      expect(result!.tags).toContain('utility');
    });

    it('should return null if skill metadata is invalid', async () => {
      const mockStat = fs.stat as unknown as jest.Mock;
      const mockReadFile = fs.readFile as unknown as jest.Mock;

      mockStat.mockResolvedValue({ isDirectory: () => true });

      // Mock SKILL.md内容缺少必需字段
      const invalidContent = `---\nname: test-skill\n---\n# Test`;
      mockReadFile.mockResolvedValue(invalidContent);

      const result = await skillManager.getSkillByName('test-skill');

      expect(result).toBeNull();
    });
  });

  describe('isSkillExist', () => {
    it('should return true if skill directory exists', async () => {
      const mockStat = fs.stat as unknown as jest.Mock;
      mockStat.mockResolvedValue({ isDirectory: () => true });

      const result = await skillManager.isSkillExist('existing-skill');

      expect(result).toBe(true);
    });

    it('should return false if skill directory does not exist', async () => {
      const mockStat = fs.stat as unknown as jest.Mock;
      mockStat.mockRejectedValue(new Error('Directory not found'));

      const result = await skillManager.isSkillExist('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should format non-Error objects correctly', () => {
      const errorFormatter = (skillManager as any).formatError;

      expect(errorFormatter(new Error('test error'))).toBe('test error');
      expect(errorFormatter('string error')).toBe('string error');
      expect(errorFormatter({ code: 500 })).toBe('Unknown error occurred');
      expect(errorFormatter(null)).toBe('Unknown error occurred');
    });
  });

  describe('getStatistics', () => {
    it('should return skills statistics', async () => {
      const mockReaddir = fs.readdir as unknown as jest.Mock;
      const mockStat = fs.stat as unknown as jest.Mock;
      const mockReadFile = fs.readFile as unknown as jest.Mock;

      // Mock 目录扫描
      mockReaddir.mockResolvedValue([
        { name: 'skill1', isDirectory: () => true },
        { name: 'skill2', isDirectory: () => true },
        { name: 'skill3', isDirectory: () => true }
      ]);

      // Mock 文件存在检查
      mockStat.mockResolvedValue({ isDirectory: () => true });

      // Mock 三个不同的SKILL.md文件
      const mockSkills = [
        { name: 'skill1', description: 'Skill 1', version: '1.0.0', category: 'test', tools: [], tags: ['test'] },
        { name: 'skill2', description: 'Skill 2', version: '1.0.0', category: 'development', tools: [], tags: ['dev'] },
        { name: 'skill3', description: 'Skill 3', version: '1.0.0', category: 'test', tools: [], tags: ['test', 'utility'] }
      ];

      mockReadFile.mockImplementation((filePath) => {
        const skillName = path.dirname(filePath as string).split('/').pop();
        const skill = mockSkills.find(s => s.name === skillName);

        if (skill) {
          return Promise.resolve(`---\nname: ${skill.name}\ndescription: ${skill.description}\nversion: ${skill.version}\ncategory: ${skill.category}\ntools: ${JSON.stringify(skill.tools)}\ntags: ${JSON.stringify(skill.tags)}\n---\n# Content`);
        }
        return Promise.reject(new Error('File not found'));
      });

      const stats = await skillManager.getStatistics();

      expect(stats.total).toBe(3);
      expect(stats.byTag.test).toBe(2);
      expect(stats.byTag.dev).toBe(1);
      expect(stats.byTag.utility).toBe(1);
      expect(stats.recentlyInstalled).toHaveLength(3);
    });
  });
});
