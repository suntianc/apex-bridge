import { Request, Response } from 'express';
import { ChatController } from '../../src/api/controllers/ChatController';
import { ChatService } from '../../src/services/ChatService';
import {
  ConversationRouter,
  RouteResolution
} from '../../src/core/conversation/ConversationRouter';
import { ConversationContext } from '../../src/types/conversation';

type MockedChatService = {
  processMessage: jest.Mock;
  streamMessage: jest.Mock;
  processNodeConversation: jest.Mock;
};

const createConversationContext = (): ConversationContext => ({
  id: 'conv-test',
  sessionType: 'single',
  members: [],
  history: [],
  pendingTasks: [],
  personaState: {},
  toolApprovals: [],
  createdAt: Date.now(),
  updatedAt: Date.now()
});

const createRoute = (personaId = '温暖伙伴'): RouteResolution => ({
  conversationId: 'conv-test',
  sessionType: 'single',
  apexMeta: {},
  primaryTarget: {
    memberId: `hub:default:${personaId}`,
    personaId,
    type: 'hub'
  },
  mandatoryTargets: [],
  broadcastTargets: [],
  mentions: [],
  waitForResult: true,
  context: createConversationContext()
});

const createResponse = () => {
  const res: {
    statusCode?: number;
    data?: unknown;
    headers: Record<string, string>;
    writes: string[];
    setHeader: jest.Mock;
    json: jest.Mock;
    write: jest.Mock;
    end: jest.Mock;
    status: jest.Mock;
  } = {
    headers: {},
    writes: [],
    setHeader: jest.fn(function (this: any, key: string, value: string) {
      this.headers[key] = value;
      return this;
    }),
    json: jest.fn(function (this: any, payload: unknown) {
      this.data = payload;
      return this;
    }),
    write: jest.fn(function (this: any, chunk: string) {
      this.writes.push(chunk);
      return true;
    }),
    end: jest.fn(),
    status: jest.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    })
  };

  return res as Response & typeof res;
};

describe('ChatController - persona routing via agent_id', () => {
  let chatService: MockedChatService;
  let controller: ChatController;
  let conversationRouter: {
    resolveRoute: jest.Mock;
    recordAssistantMessage: jest.Mock;
  };

  beforeEach(() => {
    chatService = {
      processMessage: jest.fn(),
      streamMessage: jest.fn(),
      processNodeConversation: jest.fn()
    };

    conversationRouter = {
      resolveRoute: jest.fn(),
      recordAssistantMessage: jest.fn()
    };

    controller = new ChatController(
      chatService as unknown as ChatService,
      null,
      conversationRouter as unknown as ConversationRouter
    );
  });

  it('handles JSON chat completions with agent_id override', async () => {
    const route = createRoute('温暖伙伴');
    conversationRouter.resolveRoute.mockReturnValue(route);
    chatService.processMessage.mockResolvedValue({
      content: '这是温暖伙伴的人格回复'
    });

    const req = {
      body: {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: '简单介绍一下你自己' }],
        agent_id: '活泼助手',
        stream: false
      }
    } as unknown as Request;
    const res = createResponse();

    await controller.chatCompletions(req, res as Response);

    expect(chatService.processMessage).toHaveBeenCalledWith(
      req.body.messages,
      expect.objectContaining({
        agentId: '温暖伙伴',
        model: 'gpt-4o-mini',
        stream: false
      }),
      route
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        object: 'chat.completion',
        choices: [
          expect.objectContaining({
            message: expect.objectContaining({ content: '这是温暖伙伴的人格回复' })
          })
        ]
      })
    );
    expect(conversationRouter.recordAssistantMessage).toHaveBeenCalledWith(
      route.conversationId,
      expect.objectContaining({
        content: '这是温暖伙伴的人格回复',
        personaId: '温暖伙伴'
      })
    );
  });

  it('streams SSE chunks when stream=true and preserves aggregated content', async () => {
    const route = createRoute('专业助手');
    conversationRouter.resolveRoute.mockReturnValue(route);
    chatService.streamMessage.mockReturnValue(
      (async function* () {
        yield '__META__:' + JSON.stringify({ type: 'requestId', value: 'req-stream-1' });
        yield '你好';
        yield '，这是一段流式回复';
      })()
    );

    const req = {
      body: {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: '请用专业语气回答' }],
        agent_id: '专业助手',
        stream: true
      }
    } as unknown as Request;
    const res = createResponse();

    await controller.chatCompletions(req, res as Response);

    expect(chatService.streamMessage).toHaveBeenCalledWith(
      req.body.messages,
      expect.objectContaining({ agentId: '专业助手', stream: true }),
      route
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"chat.completion.chunk"'));
    expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
    expect(res.end).toHaveBeenCalled();
    expect(conversationRouter.recordAssistantMessage).toHaveBeenCalledWith(
      route.conversationId,
      expect.objectContaining({
        content: '你好，这是一段流式回复',
        personaId: '专业助手'
      })
    );
  });
});


