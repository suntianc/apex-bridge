import { ChatService } from '../../src/services/ChatService';
import type { ProtocolEngine } from '../../src/core/ProtocolEngine';
import type { LLMClient } from '../../src/core/LLMClient';
import type { EventBus } from '../../src/core/EventBus';
import type { RouteResolution } from '../../src/core/conversation/ConversationRouter';
import { conversationContextStore } from '../../src/core/conversation/ConversationContextStore';
import type { ChatOptions, Message } from '../../src/types';

const createChatService = (): ChatService => {
  const mockProtocolEngine = {
    pluginRuntime: {
      processMessages: jest.fn(async (messages: Message[]) => messages)
    },
    parseToolRequests: jest.fn(() => []),
    variableEngine: {
      resolveAll: jest.fn(async (content: string) => content)
    }
  } as unknown as ProtocolEngine;

  const mockEventBus = {
    publish: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn()
  } as unknown as EventBus;

  return new ChatService(mockProtocolEngine, null as unknown as LLMClient, mockEventBus);
};

const createRoute = (personaId = '温暖伙伴'): RouteResolution => {
  const conversationId = `conv-${personaId}`;
  const context = conversationContextStore.ensure(conversationId, {
    sessionType: 'single',
    members: [
      {
        memberId: `hub:default:${personaId}`,
        personaId,
        type: 'hub'
      }
    ]
  });

  return {
    conversationId,
    sessionType: 'single',
    apexMeta: {},
    primaryTarget: context.members[0],
    mandatoryTargets: [],
    broadcastTargets: [],
    mentions: [],
    waitForResult: true,
    context
  };
};

describe('ChatService persona memory integration', () => {
  beforeEach(() => {
    conversationContextStore.clear();
  });

  it('reuses stored persona namespace when userId is missing', () => {
    const chatService = createChatService();
    const route = createRoute('温暖伙伴');

    const first = (chatService as any).resolvePersonaMemoryInfo(route, {
      userId: 'user-001'
    } as ChatOptions);

    expect(first.userId).toBe('user-001');
    expect(first.memoryUserId).toBe('user-001::温暖伙伴');

    const second = (chatService as any).resolvePersonaMemoryInfo(route, {} as ChatOptions);

    expect(second.userId).toBe('user-001');
    expect(second.memoryUserId).toBe('user-001::温暖伙伴');
  });

  it('injects memories with persona-specific knowledge bases', async () => {
    const chatService = createChatService();
    const memoryService = {
      recall: jest.fn().mockResolvedValue([]),
      save: jest.fn()
    };
    chatService.setMemoryService(memoryService as any);

    const baseMessages: Message[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'hello' }
    ];

    await (chatService as any).injectMemoriesIntoMessages(
      [...baseMessages],
      {
        personaId: 'alpha',
        userId: 'user-alpha',
        conversationId: 'conv-alpha',
        memoryUserId: 'user-alpha::alpha',
        knowledgeBase: 'user-alpha-persona-alpha'
      },
      {},
      { sessionMemoryLimit: 1 }
    );

    expect(memoryService.recall).toHaveBeenCalledWith(
      'user profile',
      expect.objectContaining({
        knowledgeBase: 'user-alpha-persona-alpha'
      })
    );

    memoryService.recall.mockClear();

    await (chatService as any).injectMemoriesIntoMessages(
      [...baseMessages],
      {
        personaId: 'beta',
        userId: 'user-beta',
        conversationId: 'conv-beta',
        memoryUserId: 'user-beta::beta',
        knowledgeBase: 'user-beta-persona-beta'
      },
      {},
      { sessionMemoryLimit: 1 }
    );

    expect(memoryService.recall).toHaveBeenCalledWith(
      'user profile',
      expect.objectContaining({
        knowledgeBase: 'user-beta-persona-beta'
      })
    );
  });
});

