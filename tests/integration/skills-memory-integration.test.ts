import { SkillsExecutionManager } from '../../src/core/skills/SkillsExecutionManager';
import type { SkillsLoader } from '../../src/core/skills/SkillsLoader';
import type {
  ExecutionRequest,
  ExecutionResponse,
  SkillMetadata,
  SkillSearchResult
} from '../../src/types';
import type { SkillsExecutor } from '../../src/types';
import type { IMemoryService, Memory, MemoryWriteSuggestion } from '../../src/types/memory';
import { ChatService } from '../../src/services/ChatService';
import type { ProtocolEngine } from '../../src/core/ProtocolEngine';
import type { LLMClient } from '../../src/core/LLMClient';
import type { EventBus } from '../../src/core/EventBus';
import type { Message } from '../../src/types';

const createLoader = (): SkillsLoader => {
  const metadata: SkillMetadata = {
    name: 'demo-skill',
    displayName: 'Demo Skill',
    description: 'A skill used for tests',
    version: '1.0.0',
    type: 'direct',
    category: 'test',
    domain: 'test',
    keywords: ['demo'],
    permissions: {},
    cacheable: false,
    ttl: 60_000,
    path: '/tmp/demo-skill',
    loadedAt: Date.now()
  } as SkillMetadata;

  return {
    loadSkill: jest.fn(async () => ({ metadata })),
    findSkillsByIntent: jest.fn(async () => [
      {
        metadata,
        confidence: 0.9,
        matchedKeywords: [],
        matchedDescriptionTerms: [],
        matchedTriggers: []
      } as SkillSearchResult
    ])
  } as unknown as SkillsLoader;
};

const buildExecutionResponse = (data: Record<string, any>): ExecutionResponse => ({
  success: true,
  result: {
    status: 'success',
    format: 'object',
    data
  },
  metadata: {
    executionTime: 5,
    memoryUsage: 10,
    tokenUsage: 0,
    cacheHit: false,
    executionType: 'direct',
    timestamp: Date.now()
  }
});

const createMockVcpEngine = (): ProtocolEngine =>
  ({
    pluginRuntime: {
      processMessages: jest.fn(async (messages: Message[]) => messages),
      executePlugin: jest.fn()
    },
    parseToolRequests: jest.fn(() => []),
    variableEngine: {
      resolveAll: jest.fn(async (content: string) => content)
    }
  }) as unknown as ProtocolEngine;

describe('Skills + Chat memory integration', () => {
  it('writes skill memory suggestions via IMemoryService and tolerates save failures', async () => {
    const loader = createLoader();
    const memoryService: IMemoryService = {
      save: jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('storage down')),
      recall: jest.fn()
    };

    const suggestions: MemoryWriteSuggestion[] = [
      {
        ownerType: 'user',
        ownerId: 'user-77',
        type: 'summary',
        importance: 4,
        content: '技能总结了用户最新的任务',
        metadata: { topic: 'task' }
      }
    ];

    const executor: SkillsExecutor = {
      execute: jest.fn().mockResolvedValue(buildExecutionResponse({ memoryWrites: suggestions })),
      validate: jest.fn(),
      getExecutionContext: jest.fn().mockReturnValue({}),
      cleanup: jest.fn()
    };

    const manager = new SkillsExecutionManager(loader, {
      executors: { direct: executor },
      memoryService
    });

    const request: ExecutionRequest = { skillName: 'demo-skill' };

    await manager.execute(request);
    expect(memoryService.save).toHaveBeenCalledTimes(1);
    expect(memoryService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        content: suggestions[0].content,
        metadata: expect.objectContaining({
          sourceSkill: 'demo-skill',
          ownerType: 'user',
          importance: suggestions[0].importance / 5
        })
      })
    );

    // 第二次执行模拟保存失败，但主流程不应该抛错
    await expect(manager.execute(request)).resolves.toEqual(expect.objectContaining({ success: true }));
    expect(memoryService.save).toHaveBeenCalledTimes(2);
  });

  it('processMessage injects memories, recalls profiles, and records transcripts', async () => {
    const mockVcpEngine = createMockVcpEngine();

    const mockLLMClient: LLMClient = {
      chat: jest.fn().mockResolvedValue({
        choices: [{ message: { content: '好的，我已经记录下来。' } }]
      })
    } as unknown as LLMClient;

    const mockEventBus: EventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn()
    } as unknown as EventBus;

    const userProfileMemories: Memory[] = [{ content: '用户喜欢慢跑', userId: 'user-99' }];
    const householdMemories: Memory[] = [{ content: '家庭有两只猫', userId: 'user-99' }];

    const memoryService: IMemoryService = {
      save: jest.fn().mockResolvedValue(undefined),
      recall: jest.fn().mockImplementation(async (query: string) => {
        if (query === 'user profile') {
          return userProfileMemories;
        }
        if (query === 'household profile') {
          return householdMemories;
        }
        return [];
      })
    };

    const chatService = new ChatService(mockVcpEngine, mockLLMClient, mockEventBus);
    chatService.setMemoryService(memoryService);

    const messages: Message[] = [
      { role: 'system', content: '系统提示' },
      { role: 'user', content: '帮我记录一下晚上要去健身房' }
    ];

    const response = await chatService.processMessage(messages, {
      userId: 'user-99',
      agentId: 'warm-helper'
    });

    expect(response.content).toBe('好的，我已经记录下来。');
    expect(memoryService.recall).toHaveBeenCalledWith(
      'user profile',
      expect.objectContaining({
        userId: 'user-99'
      })
    );
    expect(memoryService.recall).toHaveBeenCalledWith(
      'household profile',
      expect.objectContaining({
        userId: 'user-99'
      })
    );
    expect(memoryService.save).toHaveBeenCalledTimes(1);
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      'memory:new_document',
      expect.objectContaining({
        personaId: 'warm-helper',
        userId: 'user-99'
      })
    );
  });

  it('continues chat flow when memory recall/save throw errors', async () => {
    const mockVcpEngine = createMockVcpEngine();

    const mockLLMClient: LLMClient = {
      chat: jest.fn().mockResolvedValue({
        choices: [{ message: { content: '我会继续协助你。' } }]
      })
    } as unknown as LLMClient;

    const mockEventBus: EventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn()
    } as unknown as EventBus;

    const memoryService: IMemoryService = {
      save: jest.fn().mockRejectedValue(new Error('save failed')),
      recall: jest.fn().mockRejectedValue(new Error('recall failed'))
    };

    const chatService = new ChatService(mockVcpEngine, mockLLMClient, mockEventBus);
    chatService.setMemoryService(memoryService);

    const messages: Message[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: '请记录今天的待办事项' }
    ];

    const response = await chatService.processMessage(messages, {
      userId: 'user-100',
      agentId: 'calm-assistant'
    });

    expect(response.content).toBe('我会继续协助你。');
    expect(memoryService.recall).toHaveBeenCalled();
    expect(memoryService.save).toHaveBeenCalled();
    // save失败后不应该发布事件
    expect(mockEventBus.publish).not.toHaveBeenCalledWith('memory:new_document', expect.anything());
  });
});

