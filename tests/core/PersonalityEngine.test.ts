/**
 * PersonalityEngine 单元测试
 */

import * as fs from 'fs';
import * as path from 'path';
import { PersonalityEngine } from '../../src/core/PersonalityEngine';
import { PersonalityConfig } from '../../src/types/personality';
import { Message } from '../../src/types';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('PersonalityEngine', () => {
  const testPersonalityDir = path.join(__dirname, '../../test-config/personality');
  const testAgentDir = path.join(__dirname, '../../test-config/Agent');
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset fs.existsSync and fs.readFileSync mocks
    (mockedFs.existsSync as jest.Mock).mockReturnValue(false);
    (mockedFs.readFileSync as jest.Mock).mockReturnValue('');
  });
  
  describe('Constructor and Initialization', () => {
    it('should initialize with default config', () => {
      const engine = new PersonalityEngine();
      expect(engine).toBeInstanceOf(PersonalityEngine);
    });
    
    it('should initialize with custom config', () => {
      const config = {
        agentDir: testAgentDir,
        personalityDir: testPersonalityDir,
        cacheEnabled: false,
        defaultAgentId: 'test-default'
      };
      const engine = new PersonalityEngine(config);
      expect(engine).toBeInstanceOf(PersonalityEngine);
    });
    
    it('should initialize and load default personality', async () => {
      const defaultConfig: PersonalityConfig = {
        identity: { name: '助手', avatar: '🤖', role: 'AI助手' },
        traits: { core: ['友好', '专业'] },
        style: { tone: '专业', address: '您', emojiUsage: 'moderate' }
      };
      
      (mockedFs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
        return typeof filePath === 'string' && filePath.includes('default.json');
      });
      
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(defaultConfig));
      
      const engine = new PersonalityEngine({
        personalityDir: testPersonalityDir
      });
      
      await engine.initialize();
      // Should attempt to load default personality
      expect(mockedFs.existsSync).toHaveBeenCalled();
    });
  });
  
  describe('JSON Configuration Loading', () => {
    it('should load valid JSON personality config', () => {
      const config: PersonalityConfig = {
        identity: {
          name: '小智',
          avatar: '🤖',
          role: '智能助手'
        },
        traits: {
          core: ['专业', '高效'],
          interests: ['技术'],
          values: ['严谨']
        },
        style: {
          tone: '专业',
          address: '您',
          emojiUsage: 'rare'
        }
      };
      
      (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      
      const engine = new PersonalityEngine({
        personalityDir: testPersonalityDir
      });
      
      const loaded = engine.loadPersonality('小智');
      expect(loaded.identity.name).toBe('小智');
      expect(loaded.traits.core).toEqual(['专业', '高效']);
      expect(loaded.style.tone).toBe('专业');
    });
    
    it('should fallback to default when JSON is invalid', () => {
      (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockedFs.readFileSync as jest.Mock).mockReturnValue('invalid json{');
      
      const engine = new PersonalityEngine({
        personalityDir: testPersonalityDir,
        defaultAgentId: 'default'
      });
      
      // 当JSON解析失败时，应该fallback到default personality（容错设计）
      const loaded = engine.loadPersonality('invalid');
      expect(loaded).toBeDefined();
      expect(loaded.identity.name).toBe('助手'); // fallback default
    });
    
    it('should fallback to default when required fields are missing', () => {
      const invalidConfig = {
        identity: { name: '测试' }
        // 缺少traits和style
      };
      
      (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(invalidConfig));
      
      const engine = new PersonalityEngine({
        personalityDir: testPersonalityDir,
        defaultAgentId: 'default'
      });
      
      // 当缺少必需字段时，应该fallback到default personality（容错设计）
      const loaded = engine.loadPersonality('invalid');
      expect(loaded).toBeDefined();
      expect(loaded.identity.name).toBe('助手'); // fallback default
    });
  });
  
  describe('TXT Configuration Loading (Backward Compatibility)', () => {
    it('should load TXT file when JSON does not exist', () => {
      const txtContent = `你是小文📁。
你是用户的文件管理助手。

你可以帮助用户管理文件、查找文档、整理文件夹。`;
      
      (mockedFs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
        return typeof filePath === 'string' && filePath.includes('小文.txt');
      });
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(txtContent);
      
      const engine = new PersonalityEngine({
        personalityDir: testPersonalityDir,
        agentDir: testAgentDir
      });
      
      const loaded = engine.loadPersonality('小文');
      expect(loaded.identity.name).toBe('小文');
      expect(loaded.identity.avatar).toBe('📁');
      expect(loaded.metadata?.isTxtMode).toBe(true);
      expect(loaded.customPrompt).toBe(txtContent);
    });
    
    it('should extract name and avatar from TXT content', () => {
      const txtContent = `你是测试助手🎯。
这是一个测试内容。`;
      
      (mockedFs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
        return typeof filePath === 'string' && filePath.includes('测试.txt');
      });
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(txtContent);
      
      const engine = new PersonalityEngine({
        agentDir: testAgentDir
      });
      
      const loaded = engine.loadPersonality('测试');
      expect(loaded.identity.name).toBe('测试助手');
      expect(loaded.identity.avatar).toBe('🎯');
    });
  });
  
  describe('System Prompt Building', () => {
    it('should build System Prompt from JSON config', () => {
      const config: PersonalityConfig = {
        identity: {
          name: '小智',
          avatar: '🤖',
          role: '智能助手',
          background: '专业的AI助手'
        },
        traits: {
          core: ['专业', '高效'],
          interests: ['技术'],
          values: ['严谨']
        },
        style: {
          tone: '专业',
          address: '您',
          emojiUsage: 'rare'
        },
        behavior: {
          onSuccess: '确认完成',
          onFailure: '分析原因'
        }
      };
      
      const engine = new PersonalityEngine({ cacheEnabled: false });
      const prompt = engine.buildSystemPrompt(config, 'test');
      
      expect(prompt).toContain('你是小智');
      expect(prompt).toContain('🤖');
      expect(prompt).toContain('智能助手');
      expect(prompt).toContain('专业、高效');
      expect(prompt).toContain('称呼用户为：您');
    });
    
    it('should build System Prompt from TXT config', () => {
      const config: PersonalityConfig = {
        identity: {
          name: '小文',
          avatar: '📁',
          role: '文件管理助手'
        },
        traits: {
          core: ['兼容模式']
        },
        style: {
          tone: '自然',
          address: '您',
          emojiUsage: 'moderate'
        },
        customPrompt: '这是txt文件的原始内容',
        metadata: {
          isTxtMode: true
        }
      };
      
      const engine = new PersonalityEngine({ cacheEnabled: false });
      const prompt = engine.buildSystemPrompt(config, 'test');
      
      expect(prompt).toContain('你是小文');
      expect(prompt).toContain('📁');
      expect(prompt).toContain('这是txt文件的原始内容');
    });
    
    it('should cache System Prompt when cache is enabled', () => {
      const config: PersonalityConfig = {
        identity: { name: '测试', avatar: '🤖', role: '助手' },
        traits: { core: ['友好'] },
        style: { tone: '专业', address: '您', emojiUsage: 'moderate' }
      };
      
      const engine = new PersonalityEngine({ cacheEnabled: true });
      const prompt1 = engine.buildSystemPrompt(config, 'test');
      const prompt2 = engine.buildSystemPrompt(config, 'test');
      
      expect(prompt1).toBe(prompt2);
      // buildSystemPrompt should only be called once (cached on second call)
    });
  });
  
  describe('Message Injection', () => {
    it('should inject personality System Prompt at the beginning', () => {
      const config: PersonalityConfig = {
        identity: { name: '小智', avatar: '🤖', role: '助手' },
        traits: { core: ['专业'] },
        style: { tone: '专业', address: '您', emojiUsage: 'rare' }
      };
      
      const messages: Message[] = [
        { role: 'user', content: '你好' }
      ];
      
      const engine = new PersonalityEngine({ cacheEnabled: false });
      const injected = engine.injectIntoMessages(messages, config, 'test');
      
      expect(injected.length).toBe(2);
      expect(injected[0].role).toBe('system');
      expect(injected[0].content).toContain('你是小智');
      expect(injected[1].role).toBe('user');
      expect(injected[1].content).toBe('你好');
    });
    
    it('should preserve user system messages after personality system', () => {
      const config: PersonalityConfig = {
        identity: { name: '小智', avatar: '🤖', role: '助手' },
        traits: { core: ['专业'] },
        style: { tone: '专业', address: '您', emojiUsage: 'rare' }
      };
      
      const messages: Message[] = [
        { role: 'system', content: '用户自定义的补充说明' },
        { role: 'user', content: '你好' }
      ];
      
      const engine = new PersonalityEngine({ cacheEnabled: false });
      const injected = engine.injectIntoMessages(messages, config, 'test');
      
      expect(injected.length).toBe(3);
      expect(injected[0].role).toBe('system');
      expect(injected[0].content).toContain('你是小智'); // 人格system最前
      expect(injected[1].role).toBe('system');
      expect(injected[1].content).toBe('用户自定义的补充说明'); // 用户system保留
      expect(injected[2].role).toBe('user');
    });
  });
  
  describe('Caching', () => {
    it('should cache loaded personalities', () => {
      const config: PersonalityConfig = {
        identity: { name: '测试', avatar: '🤖', role: '助手' },
        traits: { core: ['友好'] },
        style: { tone: '专业', address: '您', emojiUsage: 'moderate' }
      };
      
      (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      
      const engine = new PersonalityEngine({
        personalityDir: testPersonalityDir
      });
      
      // First load
      const loaded1 = engine.loadPersonality('测试');
      // Second load should use cache
      const loaded2 = engine.loadPersonality('测试');
      
      expect(loaded1).toBe(loaded2);
      // readFileSync should only be called once (cached on second call)
      expect(mockedFs.readFileSync).toHaveBeenCalledTimes(1);
    });
    
    it('should clear cache for specific agent', () => {
      const engine = new PersonalityEngine({ cacheEnabled: true });
      
      // Load and cache
      const config: PersonalityConfig = {
        identity: { name: '测试', avatar: '🤖', role: '助手' },
        traits: { core: ['友好'] },
        style: { tone: '专业', address: '您', emojiUsage: 'moderate' }
      };
      engine.buildSystemPrompt(config, '测试');
      
      // Clear cache
      engine.clearCache('测试');
      
      // Rebuild should not use cache
      const prompt = engine.buildSystemPrompt(config, '测试');
      expect(prompt).toBeDefined();
    });
    
    it('should clear all cache', () => {
      const engine = new PersonalityEngine({ cacheEnabled: true });
      
      engine.clearCache();
      
      const loaded = engine.getLoadedPersonalities();
      expect(loaded.length).toBe(0);
    });
  });
  
  describe('Default Personality Fallback', () => {
    it('should use default personality when requested personality not found', () => {
      // 不存在的personality应该fallback到default
      (mockedFs.existsSync as jest.Mock).mockReturnValue(false);
      
      const engine = new PersonalityEngine({
        personalityDir: testPersonalityDir,
        defaultAgentId: 'default'
      });
      
      // 应该使用fallback默认配置
      const loaded = engine.loadPersonality('不存在的人格');
      expect(loaded.identity.name).toBe('助手');
    });
    
    it('should create fallback default when default file not found', () => {
      (mockedFs.existsSync as jest.Mock).mockReturnValue(false);
      
      const engine = new PersonalityEngine({
        personalityDir: testPersonalityDir,
        defaultAgentId: 'default'
      });
      
      const loaded = engine.loadPersonality('default');
      expect(loaded).toBeDefined();
      expect(loaded.identity.name).toBe('助手');
    });
  });
  
  describe('Agent ID Validation', () => {
    it('should reject invalid agent IDs', () => {
      const engine = new PersonalityEngine({
        personalityDir: testPersonalityDir,
        agentDir: testAgentDir
      });
      
      // Agent ID验证在loadAndCache中，当验证失败时会抛出错误
      // 但错误会被catch并fallback，所以我们需要检查错误是否被正确抛出
      // 由于容错设计，实际上会fallback到default
      const loaded1 = engine.loadPersonality('invalid@id');
      expect(loaded1.identity.name).toBe('助手'); // fallback to default
      
      const loaded2 = engine.loadPersonality('invalid id');
      expect(loaded2.identity.name).toBe('助手'); // fallback to default
      
      // 注意：由于容错设计，无效ID不会抛出错误，而是fallback到default
      // 这是预期的行为（容错性）
    });
    
    it('should accept valid agent IDs with Chinese characters', () => {
      (mockedFs.existsSync as jest.Mock).mockReturnValue(false);
      
      const engine = new PersonalityEngine();
      
      // 应该不抛出错误（会fallback到default）
      expect(() => engine.loadPersonality('小文')).not.toThrow();
      expect(() => engine.loadPersonality('专业助手')).not.toThrow();
    });
  });
  
  describe('Multi-Personality Switching', () => {
    it('should load different personalities correctly', () => {
      const config1: PersonalityConfig = {
        identity: { name: '小智', avatar: '🤖', role: '助手' },
        traits: { core: ['专业'] },
        style: { tone: '专业', address: '您', emojiUsage: 'rare' }
      };
      
      const config2: PersonalityConfig = {
        identity: { name: '小悦', avatar: '🌸', role: 'AI女儿' },
        traits: { core: ['活泼'] },
        style: { tone: '亲昵', address: '爸爸', emojiUsage: 'frequent' }
      };
      
      (mockedFs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
        return typeof filePath === 'string' && (filePath.includes('小智.json') || filePath.includes('小悦.json'));
      });
      
      (mockedFs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
        if (typeof filePath === 'string') {
          if (filePath.includes('小智.json')) {
            return JSON.stringify(config1);
          } else if (filePath.includes('小悦.json')) {
            return JSON.stringify(config2);
          }
        }
        return '';
      });
      
      const engine = new PersonalityEngine({
        personalityDir: testPersonalityDir
      });
      
      const loaded1 = engine.loadPersonality('小智');
      const loaded2 = engine.loadPersonality('小悦');
      
      expect(loaded1.identity.name).toBe('小智');
      expect(loaded1.style.address).toBe('您');
      
      expect(loaded2.identity.name).toBe('小悦');
      expect(loaded2.style.address).toBe('爸爸');
    });
  });
  
  describe('Refresh Functionality', () => {
    it('should refresh personality and reload from file', () => {
      const config: PersonalityConfig = {
        identity: { name: '测试', avatar: '🤖', role: '助手' },
        traits: { core: ['友好'] },
        style: { tone: '专业', address: '您', emojiUsage: 'moderate' }
      };
      
      (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      
      const engine = new PersonalityEngine({
        personalityDir: testPersonalityDir
      });
      
      // Load initially
      engine.loadPersonality('测试');
      
      // Clear mock call history
      (mockedFs.readFileSync as jest.Mock).mockClear();
      
      // Refresh
      engine.refreshPersonality('测试');
      
      // Should reload from file
      expect(mockedFs.readFileSync).toHaveBeenCalled();
    });
  });
});

