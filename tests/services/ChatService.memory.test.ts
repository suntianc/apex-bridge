import { ChatService } from '../../src/services/ChatService';
import type { ProtocolEngine } from '../../src/core/ProtocolEngine';
import type { EventBus } from '../../src/core/EventBus';
import type { LLMClient } from '../../src/core/LLMClient';
import type { IMemoryService, Memory } from '../../src/types/memory';
import type { ChatOptions, Message } from '../../src/types';

describe('ChatService memory injection helpers', () => {
  const createChatService = (memoryService: IMemoryService) => {
    const mockVcpEngine = {
      pluginRuntime: {
        processMessages: jest.fn(async (messages: Message[]) => messages)
      },
      parseToolRequests: jest.fn(() => [])
    } as unknown as ProtocolEngine;

    const mockEventBus = {
      publish: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn()
    } as unknown as EventBus;

    const mockLLMClient = null as unknown as LLMClient;

    const chatService = new ChatService(mockVcpEngine, mockLLMClient, mockEventBus);
    chatService.setMemoryService(memoryService);
    return chatService;
  };

  it('injects profile and session memories into the first system message', async () => {
    const userProfileMemories: Memory[] = [
      { content: '用户喜欢旅行', userId: 'user-1' },
      { content: '用户常喝乌龙茶', userId: 'user-1' }
    ];
    const householdMemories: Memory[] = [{ content: '家庭共有三口人', userId: 'user-1' }];

    const memoryService: IMemoryService = {
      save: jest.fn(),
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

    const chatService = createChatService(memoryService);

    const baseMessages: Message[] = [
      { role: 'system', content: '基础人格指令' },
      { role: 'user', content: '你好，请介绍一下我今天的日程' },
      { role: 'assistant', content: '当然，我来帮你。' },
      { role: 'user', content: '记得提醒我下午的会议。' }
    ];

    const personaInfo = {
      personaId: 'assistant-pro',
      userId: 'user-1',
      conversationId: 'conv-1',
      memoryUserId: 'user-1::assistant-pro',
      knowledgeBase: 'user-1-persona-assistant-pro'
    };

    const options: ChatOptions = { userId: 'user-1' };
    const config = { sessionMemoryLimit: 2 };

    const injectedMessages = await (chatService as any).injectMemoriesIntoMessages(
      [...baseMessages],
      personaInfo,
      options,
      config
    );

    const systemMessage = injectedMessages.find((msg) => msg.role === 'system');
    expect(systemMessage).toBeDefined();
    expect(systemMessage?.content).toContain('[记忆]');
    expect(systemMessage?.content).toContain('[用户资料]');
    expect(systemMessage?.content).toContain('用户常喝乌龙茶');
    expect(systemMessage?.content).toContain('[家庭资料]');
    expect(systemMessage?.content).toContain('家庭共有三口人');
    expect(systemMessage?.content).toContain('[会话历史]');
    // Session Memory 应只包含最后2条非system消息
    expect(systemMessage?.content).toContain('助手: 当然，我来帮你。');
    expect(systemMessage?.content).toContain('用户: 记得提醒我下午的会议。');

    // 确认按预期调用recall
    expect(memoryService.recall).toHaveBeenCalledWith(
      'user profile',
      expect.objectContaining({
        tags: ['profile', 'user']
      })
    );
    expect(memoryService.recall).toHaveBeenCalledWith(
      'household profile',
      expect.objectContaining({
        tags: ['profile', 'household']
      })
    );
  });
});

