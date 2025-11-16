import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import matter from 'gray-matter';
import { ClaudeSkillsPackager } from '../../scripts/migrate-skills-to-claude-package';

describe('ClaudeSkillsPackager', () => {
  let skillsRoot: string;

  beforeEach(async () => {
    skillsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-packager-'));
  });

  afterEach(async () => {
    await fs.rm(skillsRoot, { recursive: true, force: true });
  });

  it('migrates legacy skill into canonical structure', async () => {
    const skillDir = await createLegacySkill(skillsRoot, 'dice');

    const packager = new ClaudeSkillsPackager({
      skillDir: skillsRoot
    });
    const report = await packager.run();

    expect(report.migrated).toBe(1);

    const scriptsDir = path.join(skillDir, 'scripts');
    const executeFile = path.join(scriptsDir, 'execute.ts');
    await expect(fs.access(executeFile)).resolves.toBeUndefined();

    const skillFile = path.join(skillDir, 'SKILL.md');
    const parsed = matter(await fs.readFile(skillFile, 'utf-8'));
    expect(parsed.data.resources).toBeDefined();
    expect(parsed.data.resources.entry).toBe('./scripts/execute.ts');
    expect(parsed.data.triggers).toBeDefined();
    expect(parsed.data.input_schema).toBeDefined();
    expect(parsed.data.security).toBeDefined();

    const metadataLegacy = path.join(skillDir, 'METADATA.yml.legacy');
    await expect(fs.access(metadataLegacy)).resolves.toBeUndefined();
  });

  it('validates canonical skill structure', async () => {
    await createLegacySkill(skillsRoot, 'demo');
    const migrator = new ClaudeSkillsPackager({
      skillDir: skillsRoot
    });
    await migrator.run();

    const validator = new ClaudeSkillsPackager({
      skillDir: skillsRoot,
      validateOnly: true
    });
    const report = await validator.run();

    expect(report.failed).toBe(0);
    expect(report.validated).toBeGreaterThan(0);
  });
});

async function createLegacySkill(root: string, name: string): Promise<string> {
  const skillDir = path.join(root, name);
  await fs.mkdir(skillDir, { recursive: true });

  const metadata = `name: ${name}
displayName: ${name} v1
description: 旧版技能
version: 1.0.0
type: direct
domain: demo
keywords:
  - ${name}
permissions:
  network: false
cacheable: true
ttl: 3600
`;
  await fs.writeFile(path.join(skillDir, 'METADATA.yml'), metadata, 'utf-8');

  const skillMd = `---
name: ${name}
displayName: ${name} Skill
description: 旧版技能
version: 1.0.0
type: direct
domain: demo
keywords:
  - ${name}
---

# ${name} Skill

## 描述
用于测试的技能。

\`\`\`typescript
export async function execute(params: Record<string, unknown>) {
  return { ok: true };
}
\`\`\`
`;
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

  return skillDir;
}


