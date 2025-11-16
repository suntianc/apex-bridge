import { ProtocolEngine } from '../../src/core/ProtocolEngine';
import { VCPConfig } from '../../src/types';
import { SkillsToToolMapper } from '../../src/core/skills/SkillsToToolMapper';
import { SkillsIndex } from '../../src/core/skills/SkillsIndex';
import { SkillsCache } from '../../src/core/skills/SkillsCache';
import { InstructionLoader } from '../../src/core/skills/InstructionLoader';
import { ResourceLoader } from '../../src/core/skills/ResourceLoader';
import { SkillsLoader } from '../../src/core/skills/SkillsLoader';
import { SkillsExecutionManager } from '../../src/core/skills/SkillsExecutionManager';
import { PreferenceService } from '../../src/services/PreferenceService';

describe('Benchmark: preference → defaults/disclosure → execute', () => {
  it('runs 200 iterations under threshold', async () => {
    const vcpConfig: VCPConfig = {
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

    const index = new SkillsIndex({ skillsRoot: './skills' });
    await index.buildIndex();
    const cache = new SkillsCache();
    const instr = new InstructionLoader(index, cache);
    const res = new ResourceLoader(index, cache);
    const loader = new SkillsLoader(index, instr, res, cache);
    const exec = new SkillsExecutionManager(loader, { executors: {} } as any);
    const mapper = new SkillsToToolMapper(index);

    const pref = new PreferenceService({ foo: 'bar' as any });

    const N = 200;
    const start = Date.now();
    for (let i = 0; i < N; i++) {
      const req = await mapper.convertToolCallToExecutionRequestWithDefaults(
        { name: 'DemoAsyncTask', args: {} } as any,
        Object.fromEntries(Object.entries(pref.getView({ userId: 'u1' }).merged).map(([k, v]) => [k, v.value]))
      );
      // 执行（若 DemoAsyncTask 存在则执行，否则跳过）
      try {
        await exec.executeByIntent('DemoAsyncTask', req as any);
      } catch {
        // ignore
      }
    }
    const elapsed = Date.now() - start;
    const perOp = elapsed / N;
    // 阈值：< 15ms/次
    expect(perOp).toBeLessThan(15);
  });
});


