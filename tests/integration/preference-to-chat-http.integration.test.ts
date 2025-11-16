import express, { Express, Request, Response } from 'express';
import request from 'supertest';
import { ChatController } from '../../src/api/controllers/ChatController';
import {
  listPreferences,
  createPreference,
} from '../../src/api/controllers/PreferenceController';
import { PreferenceStorage } from '../../src/utils/preferenceStorage';

// 伪造 ChatService，仅用于验证“偏好 → ChatController 输出受影响”的 HTTP 端到端路径
class FakeChatService {
  async processMessage(messages: any[], options: any, _route: any) {
    const storage = new PreferenceStorage();
    const prefs = await storage.getUserPreferences(options.userId || 'unknown');
    const k = prefs.find((p) => p.type === 'toolsDisclosure')?.value || 'metadata';
    return { content: `[phase=${k}] ${messages?.[0]?.content ?? ''}` };
  }
  // 未用路径
  streamMessage() { throw new Error('not implemented'); }
  processNodeConversation() { throw new Error('not implemented'); }
}

// 伪造 Router（最小实现）
const conversationRouter = {
  resolveRoute: (_payload: any) => ({
    conversationId: 'conv-http-e2e',
    sessionType: 'single',
    primaryTarget: { type: 'hub', personaId: '温暖伙伴', memberId: 'hub:default:温暖伙伴' },
    mandatoryTargets: [],
    broadcastTargets: [],
    mentions: [],
    context: { id: 'conv-http-e2e' },
    waitForResult: true,
  }),
  recordAssistantMessage: jest.fn(),
};

describe('HTTP E2E: Preference API → ChatController', () => {
  let app: Express;
  const userId = 'e2e-user-2';

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // 偏好API（使用真实控制器）
    app.get('/api/preferences', (req, res) => listPreferences(req as any, res as any));
    app.post('/api/preferences', (req, res) => createPreference(req as any, res as any));

    // ChatController（使用伪造 ChatService）
    const fakeChat = new FakeChatService() as any;
    const controller = new ChatController(fakeChat, null as any, conversationRouter as any);
    app.post('/v1/chat/completions', (req: Request, res: Response) => controller.chatCompletions(req, res));
  });

  it('creates preference then returns chat response reflecting toolsDisclosure', async () => {
    // 1) 先创建偏好 toolsDisclosure=brief
    const createRes = await request(app)
      .post('/api/preferences')
      .send({
        userId,
        preference: { type: 'toolsDisclosure', value: 'brief', confidence: 0.9 },
      })
      .expect(200);
    expect(createRes.body?.success).toBe(true);

    // 2) 调用聊天接口，带上 user_id
    const chatRes = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: '请介绍一下自己' }],
        user_id: userId,
        stream: false,
      })
      .expect(200);

    const content = chatRes.body?.choices?.[0]?.message?.content || '';
    expect(content).toContain('[phase=brief]');
  });
});


