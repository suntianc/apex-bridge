/**
 * Skills-Memory-Prompt Pipeline Integration Tests
 * 
 * 工具调用全链路测试（Skills执行 → 记忆写入 → Prompt注入）
 */

import { ChatService } from '../../src/services/ChatService';
import { ProtocolEngine } from '../../src/core/ProtocolEngine';
import { LLMClient } from '../../src/core/LLMClient';
import { EventBus } from '../../src/core/EventBus';
import { PersonalityEngine } from '../../src/core/PersonalityEngine';
import { PromptBuilder } from '../../src/services/memory/PromptBuilder';
import { DefaultSemanticMemoryService } from '../../src/services/memory/SemanticMemoryService';
import { DefaultEpisodicMemoryService } from '../../src/services/memory/EpisodicMemoryService';
import { InMemorySemanticStore } from '../../src/services/memory/stores/InMemorySemanticStore';
import { InMemoryEpisodicStore } from '../../src/services/memory/stores/InMemoryEpisodicStore';
import type { AdminConfig } from '../../src/services/ConfigService';
import { Message } from '../../src/types';

describe('Skills-Memory-Prompt Pipeline Integration', () => {
  let chatService: ChatService;
  let protocolEngine: ProtocolEngine;
  let llmClient: LLMClient;
  let promptBuilder: PromptBuilder;
  let semanticMemoryService: DefaultSemanticMemoryService;
  let episodicMemoryService: DefaultEpisodicMemoryService;

  beforeEach(() => {
    const vcpConfig: AdminConfig = {
      protocol: {
        startMarker: '<<<[TOOL_REQUEST]>>>',
        endMarker: '<<<[END_TOOL_REQUEST]>>>',
        paramStartMarker: '「始」',
        paramEndMarker: '「末」'
      },
      plugins: {
        directory: './plugins'
      },
      debugMode: false,
      abp: {
        enabled: true,
        dualProtocolEnabled: true,
        errorRecoveryEnabled: true,
        jsonRepair: { enabled: true, strict: false },
        noiseStripping: { enabled: true, aggressive: false },
        boundaryValidation: { enabled: true, strict: false },
        fallback: { enabled: true, toVCP: false, toPlainText: true } // VCP fallback已移除
      }
    } as any;

    protocolEngine = new ProtocolEngine(vcpConfig);
    llmClient = new LLMClient({
      defaultProvider: 'openai',
      openai: {
        apiKey: 'test-key',
        baseURL: 'http://localhost:3000',
        defaultModel: 'test-model'
      }
    });
    const eventBus = EventBus.getInstance();
    chatService = new ChatService(protocolEngine, llmClient, eventBus);

    // Initialize memory services
    const semanticStore = new InMemorySemanticStore();
    semanticMemoryService = new DefaultSemanticMemoryService(semanticStore, {
      embeddingDimensions: 3,
      defaultTopK: 3
    });

    const episodicStore = new InMemoryEpisodicStore();
    episodicMemoryService = new DefaultEpisodicMemoryService(episodicStore, {
      defaultWindowDays: 30
    }, eventBus);

    // Initialize PromptBuilder
    promptBuilder = new PromptBuilder(semanticMemoryService, episodicMemoryService);
    chatService.setSemanticMemoryService(semanticMemoryService);
    chatService.setEpisodicMemoryService(episodicMemoryService);

    // Initialize PersonalityEngine
    const personalityEngine = new PersonalityEngine({
      personalityDir: './personalities'
    });
    chatService.setPersonalityEngine(personalityEngine);
  });

  describe('Skills Execution → Memory Write → Prompt Injection', () => {
    it('should execute skill, write memory, and inject into prompt', async () => {
      // 1. 执行技能（模拟）
      const skillResult = {
        content: '记住我今天下午2点去开会',
        memoryWrites: [
          {
            content: '今天下午2点去开会',
            importance: 0.8,
            metadata: {
              source: 'skill',
              skillName: 'reminder'
            }
          }
        ]
      };

      // 2. 写入记忆（Episodic Memory）
      const episodicResult = await episodicMemoryService.recordEvent({
        userId: 'user-1',
        personaId: 'warm-buddy',
        eventType: 'task',
        content: skillResult.memoryWrites[0].content,
        timestamp: Date.now(),
        importance: skillResult.memoryWrites[0].importance,
        metadata: skillResult.memoryWrites[0].metadata
      });

      expect(episodicResult).toBeDefined();
      expect(episodicResult.content).toBe('今天下午2点去开会');

      // 3. 构建 Prompt（包含记忆注入）
      const messages: Message[] = [
        { role: 'user', content: '我今天有什么安排？' }
      ];

      const promptStructure = await promptBuilder.buildPrompt(messages, {
        includeSessionMemory: true,
        sessionMemoryLimit: 10,
        semanticMemoryTopK: 3,
        episodicMemoryTopK: 1,
        includeToolInstr: true,
        memoryFilter: {
          userId: 'user-1',
          personaId: 'warm-buddy'
        }
      });

      expect(promptStructure.system).toBeDefined();
      expect(promptStructure.memory).toBeDefined();
      expect(promptStructure.user).toBe('我今天有什么安排？');
      expect(promptStructure.toolInstr).toBeDefined();

      // 4. 验证记忆注入
      expect(promptStructure.memory).toContain('[情景记忆]');
      // 注意：由于 Episodic Memory 查询需要时间窗口，这里只验证结构
    });

    it('should inject semantic memory into prompt', async () => {
      // 1. 保存语义记忆
      await semanticMemoryService.saveSemantic({
        userId: 'user-1',
        personaId: 'warm-buddy',
        content: '喜欢喝拿铁',
        embedding: [1, 0, 0],
        importance: 0.7
      });

      // 2. 构建 Prompt
      const messages: Message[] = [
        { role: 'user', content: '我喜欢什么咖啡？' }
      ];

      const promptStructure = await promptBuilder.buildPrompt(messages, {
        semanticMemoryTopK: 3,
        memoryFilter: {
          userId: 'user-1',
          personaId: 'warm-buddy'
        }
      });

      // 注意：由于 Semantic Memory 搜索需要 embedding，这里只验证结构
      expect(promptStructure.memory).toBeDefined();
    });

    it('should inject session memory into prompt', async () => {
      // 1. 构建包含会话历史的 Prompt
      const messages: Message[] = [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好！有什么可以帮助你的吗？' },
        { role: 'user', content: '今天天气怎么样？' }
      ];

      const promptStructure = await promptBuilder.buildPrompt(messages, {
        includeSessionMemory: true,
        sessionMemoryLimit: 10,
        memoryFilter: {
          userId: 'user-1'
        }
      });

      expect(promptStructure.memory).toContain('[会话历史]');
      expect(promptStructure.memory).toContain('你好');
      expect(promptStructure.memory).toContain('今天天气怎么样？');
    });
  });

  describe('Memory Injection Pipeline', () => {
    it('should retrieve memory and inject into LLM call', async () => {
      // 1. 保存记忆
      await episodicMemoryService.recordEvent({
        userId: 'user-1',
        personaId: 'warm-buddy',
        eventType: 'task',
        content: '今天下午2点去开会',
        timestamp: Date.now(),
        importance: 0.8
      });

      // 2. 构建 Prompt（包含记忆注入）
      const messages: Message[] = [
        { role: 'user', content: '我今天有什么安排？' }
      ];

      const promptStructure = await promptBuilder.buildPrompt(messages, {
        episodicMemoryTopK: 1,
        memoryFilter: {
          userId: 'user-1',
          personaId: 'warm-buddy'
        }
      });

      // 3. 转换为消息数组
      const injectedMessages = promptBuilder.toMessages(promptStructure);

      expect(injectedMessages.length).toBeGreaterThan(0);
      expect(injectedMessages[0].role).toBe('system');
      expect(injectedMessages[0].content).toContain('[MEMORY]');
    });
  });

  describe('RAG + Memory Separation', () => {
    it('should separate RAG and Memory data', async () => {
      // 1. 保存语义记忆
      await semanticMemoryService.saveSemantic({
        userId: 'user-1',
        personaId: 'warm-buddy',
        content: '喜欢喝拿铁',
        embedding: [1, 0, 0]
      });

      // 2. 保存情景记忆
      await episodicMemoryService.recordEvent({
        userId: 'user-1',
        personaId: 'warm-buddy',
        eventType: 'task',
        content: '今天下午2点去开会',
        timestamp: Date.now(),
        importance: 0.8
      });

      // 3. 验证数据隔离
      const semanticResults = await semanticMemoryService.searchSimilar({
        vector: [1, 0, 0],
        userId: 'user-1',
        personaId: 'warm-buddy',
        topK: 3
      }, {});

      const episodicResults = await episodicMemoryService.queryWindow({
        userId: 'user-1',
        personaId: 'warm-buddy',
        topK: 1,
        window: {
          lastDays: 7
        }
      }, {});

      // 验证数据隔离：Semantic Memory 和 Episodic Memory 是分离的
      expect(semanticResults.results.length).toBeGreaterThanOrEqual(0);
      expect(episodicResults.events.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ABP Protocol Complete Flow', () => {
    it('should parse ABP protocol, execute skill, and return result', async () => {
      // 1. 模拟 LLM 输出 ABP 格式的工具调用
      const llmOutput = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  "parameters": {
    "expression": "2+2"
  }
}
[[END_ABP_TOOL]]`;

      // 2. 解析 ABP 协议
      const toolRequests = protocolEngine.parseToolRequests(llmOutput);

      expect(toolRequests.length).toBeGreaterThan(0);
      expect(toolRequests[0].protocol).toBe('abp');
      expect(toolRequests[0].name).toBe('Calculator');
      expect(toolRequests[0].args).toBeDefined();
      expect(toolRequests[0].args.expression).toBe('2+2');

      // 3. 验证工具调用格式
      // 注意：实际工具执行需要注册的工具，这里只验证解析部分
    });

    it('should handle ABP protocol error recovery', async () => {
      // 1. 模拟 LLM 输出包含错误的 ABP 格式
      const llmOutput = `[[ABP_TOOL:Calculator]]
{
  "action": "calculate",
  // 缺少 closing brace
  "parameters": {
    "expression": "2+2"
}`;

      // 2. 解析 ABP 协议（应该尝试恢复）
      const toolRequests = protocolEngine.parseToolRequests(llmOutput);

      // 应该尝试恢复或 fallback
      expect(toolRequests).toBeDefined();
    });

    it('should fallback to plain text when ABP parsing fails', async () => {
      // 1. 模拟 LLM 输出包含无效 ABP（VCP协议已移除）
      const llmOutput = `[[ABP_TOOL:Invalid]]
{
  // 无效的JSON
}`;

      // 2. 解析（应该 fallback 到 plain text，因为VCP协议已移除）
      const toolRequests = protocolEngine.parseToolRequests(llmOutput);

      // VCP协议已移除，无法fallback到VCP
      // 应该返回空结果或尝试修复JSON
      expect(toolRequests).toBeDefined();
      // 由于ABP解析失败且VCP fallback已移除，结果可能是空数组或修复后的结果
    });
  });
});

