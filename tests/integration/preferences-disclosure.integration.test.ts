import { ProtocolEngine } from '../../src/core/ProtocolEngine';
import type { AdminConfig } from '../../src/services/ConfigService';

describe('Preference-driven disclosure integration', () => {
  it('should select brief phase when toolsDisclosure=brief', async () => {
    const vcpConfig: AdminConfig = {
      protocol: {
        startMarker: '<<<[TOOL_REQUEST]>>>',
        endMarker: '<<<[END_TOOL_REQUEST]>>>',
        paramStartMarker: '「始」',
        paramEndMarker: '「末」'
      },
      plugins: { directory: './plugins' },
      debugMode: false,
      abp: {
        enabled: true,
        dualProtocolEnabled: false,
        errorRecoveryEnabled: true,
        jsonRepair: { enabled: true, strict: false },
        noiseStripping: { enabled: true, aggressive: false },
        boundaryValidation: { enabled: true, strict: false },
        fallback: { enabled: true, toVCP: false, toPlainText: true }
      }
    } as any;

    const engine = new ProtocolEngine(vcpConfig);
    await engine.initialize();

    // 注入一个最小的 Skills 描述生成器
    const fakeGen = {
      getDescriptionByPhase: async (name: string, phase: string) => `[${phase}] ${name}`,
      getMetadataDescription: async (name: string) => `[metadata] ${name}`,
    };
    // @ts-ignore: access setter through public API
    engine.setSkillsDescriptionGenerator(fakeGen as any);

    // 通过变量引擎解析 {{ABPAllTools}}，携带偏好选择 brief
    const ve = (engine as any).variableEngine;
    const provider = ve.getProvider('ToolDescriptionProvider') as any;
    const out = await provider.resolve('ABPAllTools', {
      toolsDisclosure: 'brief',
      skillsList: ['DemoAsyncTask', 'HealthCheck']
    });

    expect(out).toContain('[brief] DemoAsyncTask');
    expect(out).toContain('[brief] HealthCheck');
  });
});


