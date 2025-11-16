import { ConversationRouter } from '../../src/core/conversation/ConversationRouter';
import { ConversationContextStore } from '../../src/core/conversation/ConversationContextStore';
import type { ConversationRequestPayload } from '../../src/types';

const createRouter = (eventBus: { publish: jest.Mock }) => {
  const contextStore = new ConversationContextStore();
  const nodeService = {
    getAllNodes: jest.fn(() => [
      {
        id: 'hub-node',
        type: 'hub',
        boundPersonas: ['温暖伙伴']
      }
    ]),
    getNode: jest.fn((nodeId: string) => {
      if (nodeId === 'hub-node') {
        return {
          id: nodeId,
          type: 'hub',
          boundPersonas: ['温暖伙伴']
        };
      }
      return undefined;
    })
  };

  const router = new ConversationRouter({
    defaultHubPersonaId: '温暖伙伴',
    defaultHubMemberId: 'hub-main',
    contextStore,
    nodeService: nodeService as any,
    eventBus: eventBus as any
  });

  return { router, contextStore };
};

describe('ConversationRouter events', () => {
  it('publishes conversation:user_message events when routing', () => {
    const eventBus = { publish: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn() };
    const { router } = createRouter(eventBus);

    const payload: ConversationRequestPayload = {
      messages: [
        { role: 'system', content: '系统提示' },
        { role: 'user', content: '你好 @温暖伙伴' }
      ],
      options: {}
    };

    router.resolveRoute(payload);

    expect(eventBus.publish).toHaveBeenCalledWith(
      'conversation:user_message',
      expect.objectContaining({
        conversationId: expect.any(String),
        message: expect.objectContaining({ content: '你好 @温暖伙伴' }),
        mentions: expect.arrayContaining([]),
        sessionType: 'single'
      })
    );
  });

  it('publishes conversation:assistant_message events when recording replies', () => {
    const eventBus = { publish: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn() };
    const { router } = createRouter(eventBus);

    const conversationId = 'conv-events';
    router.recordAssistantMessage(conversationId, {
      role: 'assistant',
      content: '这是回覆',
      personaId: '温暖伙伴'
    });

    expect(eventBus.publish).toHaveBeenCalledWith(
      'conversation:assistant_message',
      expect.objectContaining({
        conversationId,
        message: expect.objectContaining({
          content: '这是回覆',
          personaId: '温暖伙伴'
        })
      })
    );
  });
});

