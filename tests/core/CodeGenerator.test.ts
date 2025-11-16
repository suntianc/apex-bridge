import { CodeGenerator } from '../../src/core/skills/CodeGenerator';
import { CodeExtractionError } from '../../src/core/skills/CodeGenerationErrors';
import { CodeGenerationProfiler } from '../../src/core/skills/CodeGenerationProfiler';
import type { SkillContent } from '../../src/types';

const createSkillContent = (codeBlocks: Array<{ language: string; code: string }>): SkillContent => ({
  name: 'dice',
  raw: '',
  sections: [],
  codeBlocks,
  path: '/tmp/dice/SKILL.md',
  loadedAt: Date.now()
});

describe('CodeGenerator', () => {
  it('compiles TypeScript code blocks to JavaScript with metadata', async () => {
    const generator = new CodeGenerator();
    const skillContent = createSkillContent([
      {
        language: 'typescript',
        code: `
import _ from 'lodash';

export const roll = (sides: number = 6) => {
  return _.random(1, sides);
};
        `.trim()
      }
    ]);

    const result = await generator.generate(skillContent);

    expect(result.javascript).toContain('exports.roll');
    expect(result.metadata.exports).toContain('roll');
    expect(result.dependencies[0]).toMatchObject({
      module: 'lodash',
      importType: 'import'
    });
  });

  it('throws when no TypeScript blocks exist', async () => {
    const generator = new CodeGenerator();
    const skillContent = createSkillContent([
      { language: 'markdown', code: '# No code' }
    ]);

    await expect(generator.generate(skillContent)).rejects.toThrow(CodeExtractionError);
  });

  it('rejects forbidden dependencies', async () => {
    const generator = new CodeGenerator();
    const skillContent = createSkillContent([
      {
        language: 'ts',
        code: `
const cp = require('child_process');
export const exec = () => cp.execSync('ls');
        `.trim()
      }
    ]);

    await expect(generator.generate(skillContent)).rejects.toThrow(/内置模块未在白名单中/);
  });

  it('captures profiling metrics', async () => {
    const generator = new CodeGenerator();
    const profiler = new CodeGenerationProfiler();
    const skillContent = createSkillContent([
      {
        language: 'typescript',
        code: 'export const value = 1;'
      }
    ]);

    await generator.generate(skillContent, { profiler });
    const metrics = profiler.finalize();

    expect(metrics.phases.total).toBeGreaterThan(0);
    expect(metrics.phases.extraction).toBeGreaterThanOrEqual(0);
    expect(metrics.metadata).toMatchObject({ skillName: 'dice' });
  });
});

