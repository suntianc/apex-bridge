import { verifyCallbackAuth, generateHMACSignature } from '../../src/utils/callbackAuth';
import { ConfigService } from '../../src/services/ConfigService';

describe('callbackAuth security', () => {
  const buildConfig = (overrides: Partial<ReturnType<ConfigService['readConfig']>> = {}) => ({
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
      hmacWindowSeconds: 60
    },
    ...overrides
  });

  const createConfigService = (configOverrides: Partial<ReturnType<ConfigService['readConfig']>> = {}) => {
    const config = buildConfig(configOverrides);
    return {
      readConfig: jest.fn(() => config),
      updateConfig: jest.fn()
    } as unknown as ConfigService;
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ABP-only: 不再支持使用 legacy VCP key 直连鉴权，以下用例移除

  it('rejects stale HMAC signatures outside configured window', () => {
    const configService = createConfigService({ pluginCallback: { hmacWindowSeconds: 30 } });
    const header = 'Bearer hmac-client';
    const timestamp = Math.floor(Date.now() / 1000) - 120; // older than 30 seconds
    const signature = generateHMACSignature(header, { status: 'Succeed' }, timestamp, 'legacy-secret');

    const result = verifyCallbackAuth(header, { status: 'Succeed' }, timestamp.toString(), signature, {
      configService,
      hmacWindowSeconds: 30
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside allowed window');
  });

  it('accepts valid HMAC signatures within window', () => {
    const configService = createConfigService({ pluginCallback: { hmacWindowSeconds: 120 } });
    const header = 'Bearer hmac-client';
    const timestamp = Math.floor(Date.now() / 1000);
    // 使用与服务端一致的secret：优先节点apiKey，否则第一个apiKeys.key（此处为 'api-key'）
    const signature = generateHMACSignature(header, { status: 'Succeed' }, timestamp, 'api-key');

    const result = verifyCallbackAuth(header, { status: 'Succeed' }, timestamp.toString(), signature, {
      configService,
      hmacWindowSeconds: 120
    });

    expect(result.valid).toBe(true);
    expect(result.method).toBe('hmac');
  });
});
