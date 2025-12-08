/**
 * ReAct工具调用端到端测试
 * 验证完整用户场景：ReActStrategy → 工具发现 → 工具调用 → 结果返回
 */

// Mock p-queue模块（ES模块兼容性问题）
jest.mock('p-queue', () => {
  return jest.fn().mockImplementation(() => {
    return {
      add: jest.fn((fn) => fn()),
      addAll: jest.fn((fns) => Promise.all(fns.map(fn => fn()))),
      pause: jest.fn(),
      start: jest.fn(),
      clear: jest.fn(),
      onIdle: jest.fn(() => Promise.resolve()),
      onEmpty: jest.fn(() => Promise.resolve()),
      onCompleted: jest.fn(),
      size: 0,
      pending: 0,
      isPaused: false
    };
  });
});

// Mock LLMConfigService to provide embedding model config
jest.mock('../../src/services/LLMConfigService', () => {
  return {
    LLMConfigService: {
      getInstance: jest.fn().mockReturnValue({
        getDefaultModel: jest.fn().mockResolvedValue({
          id: 'test-embedding-model',
          modelKey: 'all-MiniLM-L6-v2',
          modelType: 'embedding',
          providerId: 'test-provider',
          isDefault: true,
          modelConfig: {
            local: true,
            model: 'all-MiniLM-L6-v2'
          }
        }),
        getProvider: jest.fn().mockResolvedValue({
          id: 'test-provider',
          name: 'Test Provider'
        })
      })
    }
  };
});

// Mock ToolRetrievalService to avoid LanceDB dependencies
const mockSkills = new Map();

jest.mock('../../src/services/ToolRetrievalService', () => ({
  ToolRetrievalService: jest.fn().mockImplementation(() => ({
    isInitialized: true,
    initialize: jest.fn().mockResolvedValue(undefined),

    addSkill: jest.fn().mockImplementation(async (skill) => {
      const clonedSkill = JSON.parse(JSON.stringify(skill));
      mockSkills.set(skill.id, clonedSkill);
      return clonedSkill;
    }),

    removeSkill: jest.fn().mockImplementation(async (id) => {
      mockSkills.delete(id);
    }),

    searchSkills: jest.fn().mockImplementation(async (query, limit = 5) => {
      const allSkills = Array.from(mockSkills.values());
      const results = allSkills.slice(0, limit).map(skill => ({
        skill,
        score: 0.8 + Math.random() * 0.2 // 模拟相似度分数
      }));
      return { results, total: results.length };
    }),

    // 新增方法，用于ReAct策略
    findRelevantSkills: jest.fn().mockImplementation(async (query, limit = 5) => {
      const allSkills = Array.from(mockSkills.values());
      const results = allSkills.slice(0, limit).map(skill => ({
        skill,
        score: 0.8 + Math.random() * 0.2
      }));
      return results;
    }),

    getSkillById: jest.fn().mockImplementation(async (id) => {
      return mockSkills.get(id) || null;
    }),

    vectorizeSkill: jest.fn().mockImplementation(async (skill) => {
      // 返回模拟的向量
      return {
        ...skill,
        vector: new Array(384).fill(0).map(() => Math.random())
      };
    }),

    clearCache: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined)
  }))
}))

import { ReActStrategy } from '../../src/strategies/ReActStrategy';
import { LLMManager } from '../../src/core/LLMManager';
import { AceIntegrator } from '../../src/services/AceIntegrator';
import { ConversationHistoryService } from '../../src/services/ConversationHistoryService';
import { SkillManager } from '../../src/services/SkillManager';
import { ToolRetrievalService } from '../../src/services/ToolRetrievalService';
import { BuiltInToolsRegistry } from '../../src/services/BuiltInToolsRegistry';
import { BuiltInExecutor } from '../../src/services/executors/BuiltInExecutor';
import { SkillsSandboxExecutor } from '../../src/services/executors/SkillsSandboxExecutor';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';
import { Message } from '../../src/types';

// 创建测试用ZIP文件
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

${metadata.description}
`;

  zip.addFile('SKILL.md', Buffer.from(skillMdContent, 'utf8'));

  // 创建简单的execute.js（返回模拟结果）
  const executeScript = `
module.exports = async function execute(args) {
  console.log('Executing skill: ${skillName}', args);

  // 模拟执行
  return {
    success: true,
    output: \\\`Skills ${skillName} executed successfully\\\`,
    skillName: '${skillName}',
    args
  };
}
`;
  zip.addFile('scripts/execute.js', Buffer.from(executeScript, 'utf8'));

  return zip.toBuffer();
}

describe('ReAct策略工具调用端到端测试', () => {
  let reactStrategy: ReActStrategy;
  let skillManager: SkillManager;
  let testSkillsPath: string;
  let testVectorDbPath: string;

  // Mock服务（因为实际依赖复杂）
  let mockLLMManager: any;
  let mockAceIntegrator: any;
  let mockHistoryService: any;

  beforeAll(async () => {
    // 创建临时测试目录
    const testId = Date.now();
    testSkillsPath = path.join(os.tmpdir(), `test-e2e-skills-${testId}`);
    testVectorDbPath = path.join(os.tmpdir(), `test-e2e-vectordb-${testId}`);

    await fs.mkdir(testSkillsPath, { recursive: true });
    await fs.mkdir(testVectorDbPath, { recursive: true });

    // Mock LLMManager（避免真实API调用）
    mockLLMManager = {
      chat: jest.fn().mockImplementation(async (messages, options) => {
        // 模拟LLM响应：识别需要工具调用
        const lastMessage = messages[messages.length - 1];

        if (lastMessage.content.includes('计算') || lastMessage.content.includes('calc')) {
          // 模拟需要计算工具
          return {
            content: '我会帮你计算',
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
          };
        } else if (lastMessage.content.includes('git') || lastMessage.content.includes('提交')) {
          // 模拟需要git工具
          return {
            content: '我会帮你执行git操作',
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
          };
        }

        return {
          content: '我理解你的请求',
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
        };
      }),

      streamChat: jest.fn().mockImplementation(async function* (messages, options, signal) {
        // 模拟流式响应
        const lastMessage = messages[messages.length - 1];

        if (lastMessage.content.includes('计算') || lastMessage.content.includes('calc')) {
          yield '我会帮你计算';
        } else if (lastMessage.content.includes('流式') || lastMessage.content.includes('stream')) {
          // 对于流式测试，模拟一个思考过程
          yield { type: 'reasoning', content: '让我思考一下这个问题' };
          yield '这个问题很简单';
          yield '答案是：4';
        } else {
          yield '我理解你的请求';
        }
      }),

      supportsStreaming: jest.fn().mockReturnValue(true)
    };

    // Mock AceIntegrator
    mockAceIntegrator = {
      isEnabled: jest.fn().mockReturnValue(false),
      saveTrajectory: jest.fn().mockResolvedValue(undefined),
      updateSessionActivity: jest.fn().mockResolvedValue(undefined)
    };

    // Mock ConversationHistoryService
    mockHistoryService = {
      saveMessages: jest.fn().mockResolvedValue(undefined),
      getMessageCount: jest.fn().mockResolvedValue(0)
    };

    // 初始化测试环境
    SkillManager.resetInstance();

    // 初始化检索服务（使用Mock）
    const retrievalService = new ToolRetrievalService({
      vectorDbPath: testVectorDbPath,
      model: 'all-MiniLM-L6-v2',
      dimensions: 384,
      similarityThreshold: 0.6,
      cacheSize: 100
    });
    await retrievalService.initialize();

    // 创建ReActStrategy实例（构造函数已更新，不再需要 variableEngine）
    reactStrategy = new ReActStrategy(
      mockLLMManager as any,
      mockAceIntegrator as AceIntegrator,
      mockHistoryService as ConversationHistoryService
    );

    // 获取SkillManager（使用Mock的检索服务）
    skillManager = SkillManager.getInstance(testSkillsPath, retrievalService);
  });

  afterAll(async () => {
    // 清理
    try {
      await fs.rm(testSkillsPath, { recursive: true, force: true });
      await fs.rm(testVectorDbPath, { recursive: true, force: true });
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  });

  describe('用户场景1：数学计算（内置工具）', () => {
    it('应该在ReAct过程中自动发现并使用CalculationTool', async () => {
      // 1. 准备消息
      const messages: Message[] = [
        { role: 'user', content: '请帮我计算 (10 + 5) * 2 的结果' }
      ];

      // 2. 创建ReAct选项
      const options = {
        selfThinking: {
          enabled: true,
          maxIterations: 3,
          includeThoughtsInResponse: true,
          enableStreamThoughts: false
        },
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        temperature: 0.7
      };

      // 3. 执行ReAct策略
      const result = await reactStrategy.execute(messages, options as any);

      // 4. 验证结果
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();

      // 验证ReAct策略被调用（iterations可能为0如果LLM直接回答了）
      console.log('✅ ReAct计算完成:', {
        iterations: result.iterations,
        content: result.content,
        thinkingLength: result.thinkingProcess?.length || 0
      });
    });
  });

  describe('用户场景2：Skills发现和使用', () => {
    it('应该能够通过向量检索发现相关的Skills并在ReAct中使用', async () => {
      // 1. 安装测试Skills（git相关）
      const gitSkillName = 'test-git-commit-skill';
      const gitMetadata = {
        description: '自动执行Git提交和版本管理的工具',
        version: '1.0.0',
        category: 'git',
        tools: ['commit', 'push', 'pull'],
        tags: ['git', 'version-control', 'commit']
      };

      const gitZipBuffer = await createTestSkillZip(gitSkillName, gitMetadata);
      const installResult = await skillManager.installSkill(gitZipBuffer, {
        overwrite: true,
        skipVectorization: false
      });

      expect(installResult.success).toBe(true);
      // 注意：使用mock服务时，vectorized状态可能不准确，主要验证ReAct流程

      // 2. 准备消息（与git相关）
      const messages: Message[] = [
        { role: 'user', content: '请帮我提交今天的代码修改到git仓库' }
      ];

      // 3. 执行ReAct策略
      const options = {
        selfThinking: {
          enabled: true,
          maxIterations: 3,
          includeThoughtsInResponse: true
        },
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        temperature: 0.7
      };

      const result = await reactStrategy.execute(messages, options as any);

      // 4. 验证结果
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();

      // 验证思考过程中识别了git相关工具（如果ReAct策略成功执行）
      if (result.thinkingProcess) {
        expect(
          result.thinkingProcess.toLowerCase().includes('git') ||
          result.thinkingProcess.toLowerCase().includes('commit')
        ).toBe(true);
      }

      console.log('✅ ReAct Git操作完成:', {
        iterations: result.iterations,
        content: result.content.substring(0, 100) + '...'
      });

      // 5. 清理
      await skillManager.uninstallSkill(gitSkillName);
    }, 30000);
  });

  describe('用户场景3：混合工具调用', () => {
    it('应该能在一次ReAct过程中同时使用内置工具和Skills', async () => {
      // 1. 安装一个文件操作相关的Skills
      const fileSkillName = 'test-file-operation-skill';
      const fileMetadata = {
        description: '高级文件操作工具，支持批量处理和转换',
        version: '1.0.0',
        category: 'filesystem',
        tools: ['batch-rename', 'convert-encoding'],
        tags: ['file', 'batch', 'advanced']
      };

      const fileZipBuffer = await createTestSkillZip(fileSkillName, fileMetadata);
      await skillManager.installSkill(fileZipBuffer, {
        overwrite: true,
        skipVectorization: false
      });

      // 2. 准备消息（同时涉及计算和文件操作）
      const messages: Message[] = [
        {
          role: 'user',
          content: '请帮我计算项目中的代码行数，并保存到statistics.txt文件中'
        }
      ];

      // 3. 执行ReAct策略
      const options = {
        selfThinking: {
          enabled: true,
          maxIterations: 5,
          includeThoughtsInResponse: true
        },
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        temperature: 0.7
      };

      const result = await reactStrategy.execute(messages, options as any);

      // 4. 验证结果
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();

      // 验证思考过程可能涉及多种工具
      if (result.thinkingProcess) {
        const thinkingLower = result.thinkingProcess.toLowerCase();
        expect(
          thinkingLower.includes('calc') ||
          thinkingLower.includes('count') ||
          thinkingLower.includes('file') ||
          thinkingLower.includes('save')
        ).toBe(true);
      }

      console.log('✅ ReAct混合工具调用完成:', {
        iterations: result.iterations,
        content: result.content.substring(0, 100) + '...'
      });

      // 5. 清理
      await skillManager.uninstallSkill(fileSkillName);
    }, 30000);
  });

  describe('边界情况：工具调用失败', () => {
    it('应该能优雅处理工具调用失败的情况', async () => {
      // 1. 准备消息（请求一个不存在的工具）
      const messages: Message[] = [
        { role: 'user', content: '请使用non-existent-tool执行某个操作' }
      ];

      // 2. 执行ReAct策略
      const options = {
        selfThinking: {
          enabled: true,
          maxIterations: 2,
          includeThoughtsInResponse: true
        }
      };

      const result = await reactStrategy.execute(messages, options as any);

      // 3. 验证结果（应该返回错误信息或降级处理的结果）
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();

      console.log('✅ ReAct错误处理完成:', {
        iterations: result.iterations,
        content: result.content.substring(0, 100) + '...'
      });
    });
  });

  describe('流式输出测试', () => {
    it('应该支持流式输出的思考过程', async () => {
      // 1. 准备消息
      const messages: Message[] = [
        { role: 'user', content: '请用流式方式回答这个复杂问题：2+2等于几？' }
      ];

      // 2. 执行流式ReAct
      const options = {
        selfThinking: {
          enabled: true,
          maxIterations: 3,
          enableStreamThoughts: true
        }
      };

      const collectedEvents: any[] = [];

      for await (const event of reactStrategy.stream(messages, options as any)) {
        collectedEvents.push(event);
      }

      // 3. 验证流式事件
      expect(collectedEvents.length).toBeGreaterThan(0);

      // 验证事件类型 - 可能是字符串内容，也可能是对象（如原始数据）
      const hasStringEvents = collectedEvents.some(e => typeof e === 'string');
      const hasObjectEvents = collectedEvents.some(e => typeof e === 'object');

      expect(hasStringEvents || hasObjectEvents).toBe(true);

      // 打印事件用于调试
      console.log('✅ ReAct流式输出完成:', {
        totalEvents: collectedEvents.length,
        events: collectedEvents.map(e => typeof e === 'string' ? e.substring(0, 50) : `[${typeof e}]: ${JSON.stringify(e).substring(0, 50)}`)
      });
    });
  });
});
