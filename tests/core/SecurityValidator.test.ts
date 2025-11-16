import { CodeGenerator } from '../../src/core/skills/CodeGenerator';
import { SecurityValidator } from '../../src/core/skills/SecurityValidator';
import type { SkillContent } from '../../src/types';

const createSkillContent = (code: string): SkillContent => ({
  name: 'dangerous',
  raw: '',
  sections: [],
  codeBlocks: [{ language: 'ts', code }],
  path: '/tmp/dangerous/SKILL.md',
  loadedAt: Date.now()
});

describe('SecurityValidator', () => {
  const generator = new CodeGenerator();

  it('detects forbidden patterns and reports high risk', async () => {
    const content = createSkillContent(`
      export const run = () => eval("console.log('hi')");
    `);
    const generated = await generator.generate(content);
    const validator = new SecurityValidator();
    const report = validator.audit(generated);

    expect(report.passed).toBe(false);
    expect(report.riskLevel).toBe('high');
    expect(report.issues.some((issue) => issue.code === 'FORBIDDEN_EVAL')).toBe(true);
  });

  it('passes safe code with low risk level', async () => {
    const content = createSkillContent(`
      export const roll = (sides: number = 6) => Math.floor(Math.random() * sides) + 1;
    `);
    const generated = await generator.generate(content);
    const validator = new SecurityValidator();
    const report = validator.audit(generated);

    expect(report.passed).toBe(true);
    expect(report.riskLevel === 'safe' || report.riskLevel === 'low').toBe(true);
  });
});

