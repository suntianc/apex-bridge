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

  it('rejects legacy VCP key when compatibility mode is disabled', () => {
    const configService = createConfigService({ pluginCallback: { allowLegacyVcpKey: false } });
    const result = verifyCallbackAuth('Bearer legacy-secret', {}, undefined, undefined, {
      configService,
      allowLegacyVCPKey: false
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Legacy VCP key not allowed');
  });

  it('allows legacy VCP key when compatibility mode is enabled', () => {
    const configService = createConfigService({ pluginCallback: { allowLegacyVcpKey: true } });
    const result = verifyCallbackAuth('Bearer legacy-secret', {}, undefined, undefined, {
      configService,
      allowLegacyVCPKey: true
    });

    expect(result.valid).toBe(true);
    // VCP协议已移除，方法名已更新为api_key（向后兼容VCP_KEY环境变量）
    expect(result.method).toBe('api_key');
  });

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
    const signature = generateHMACSignature(header, { status: 'Succeed' }, timestamp, 'legacy-secret');

    const result = verifyCallbackAuth(header, { status: 'Succeed' }, timestamp.toString(), signature, {
      configService,
      hmacWindowSeconds: 120
    });

    expect(result.valid).toBe(true);
    expect(result.method).toBe('hmac');
  });
});
