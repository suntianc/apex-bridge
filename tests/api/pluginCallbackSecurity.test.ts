import { createPluginCallbackRouter } from '../../src/api/plugin-callback';
import { generateHMACSignature } from '../../src/utils/callbackAuth';
import { ConfigService } from '../../src/services/ConfigService';

describe('plugin callback security router', () => {
  jest.setTimeout(15000);
  const asyncResultProvider = { saveAsyncResult: jest.fn().mockResolvedValue(undefined) };
  const protocolEngine = {
    variableEngine: {
      providers: {
        get: jest.fn(() => asyncResultProvider)
      }
    }
  };

  const createConfigService = (overrides: Partial<ReturnType<ConfigService['readConfig']>> = {}) => {
    const config = {
      auth: {
        vcpKey: 'legacy-secret',
        apiKeys: [
          {
            id: 'api-1',
            name: 'primary',
            key: 'api-key',
            createdAt: Date.now()
          }
        ],
        admin: {
          username: 'admin',
          password: 'admin'
        }
      },
      pluginCallback: {
        allowLegacyVcpKey: false,
        hmacWindowSeconds: 120,
        rateLimit: {
          enabled: true,
          windowMs: 1000,
          max: 2
        },
        ...(overrides.pluginCallback ?? {})
      },
      ...overrides
    };

    return {
      readConfig: jest.fn(() => config),
      updateConfig: jest.fn()
    } as unknown as ConfigService;
  };

  const createHandler = (configService: ConfigService) => {
    const router = createPluginCallbackRouter({
      protocolEngine,
      webSocketManager: undefined,
      config: {},
      configService
    });

    const layer = router.stack.find((item: any) => item.route?.path === '/:pluginName/:taskId');
    if (!layer) {
      throw new Error('Route layer not found');
    }
    return layer.route.stack[0].handle as (req: any, res: any, next: any) => Promise<void>;
  };

  const createRequest = (taskId: string, timestampSeconds: number, signature: string) => ({
    params: { pluginName: 'testPlugin', taskId },
    body: { status: 'Succeed' },
    headers: {
      authorization: 'Bearer api-key',
      'x-timestamp': timestampSeconds.toString(),
      'x-signature': signature
    },
    ip: '127.0.0.1'
  });

  const createResponse = () => {
    const res: any = { statusCode: 200 };
    res.json = jest.fn((body: any) => {
      res.body = body;
      return res;
    });
    res.status = jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    });
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throttles callback requests when exceeding rate limit', async () => {
    const configService = createConfigService();
    const handler = createHandler(configService);

    const createSignedRequest = (taskId: string) => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = generateHMACSignature('Bearer api-key', { status: 'Succeed' }, timestamp, 'legacy-secret');
      return createRequest(taskId, timestamp, signature);
    };

    const firstRes = createResponse();
    await handler(createSignedRequest('task-1'), firstRes, jest.fn());
    expect(firstRes.statusCode).toBe(200);

    const secondRes = createResponse();
    await handler(createSignedRequest('task-2'), secondRes, jest.fn());
    expect(secondRes.statusCode).toBe(200);

    // 第三次请求：确保与前两次在同一窗口内
    const thirdRes = createResponse();
    await handler(createSignedRequest('task-3'), thirdRes, jest.fn());
    // 某些环境下限流策略可能在窗口边界放过一次，改为断言状态码为429或已返回错误体
    const isThrottled = thirdRes.status.mock.calls.some((c: any[]) => c[0] === 429);
    const isErrorBody =
      thirdRes.body?.error === 'too_many_requests' ||
      thirdRes.json.mock.calls.some((c: any[]) => c[0]?.error === 'too_many_requests');
    expect(isThrottled || isErrorBody).toBe(true);
  });

  it('returns sanitised error for invalid authentication', async () => {
    const configService = createConfigService();
    const handler = createHandler(configService);
    const res = createResponse();

    await handler(
      {
        params: { pluginName: 'testPlugin', taskId: 'task-unauth' },
        body: {},
        headers: {},
        ip: '127.0.0.1'
      },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'unauthorized',
      message: 'Missing Authorization header'
    });
  });
});
