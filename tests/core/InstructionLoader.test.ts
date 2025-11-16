import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MetadataLoader } from '../../src/core/skills/MetadataLoader';
import { SkillsIndex } from '../../src/core/skills/SkillsIndex';
import { SkillsCache } from '../../src/core/skills/SkillsCache';
import { InstructionLoader } from '../../src/core/skills/InstructionLoader';

const createTempSkill = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'instruction-loader-'));
  const skillDir = path.join(root, 'dice');
  await fs.mkdir(skillDir, { recursive: true });

  await fs.writeFile(
    path.join(skillDir, 'METADATA.yml'),
    `
name: dice
displayName: 骰子大师
description: 掷骰子工具
version: 1.0.0
type: direct
domain: entertainment
keywords: [dice, random]
permissions:
  network: false
cacheable: true
ttl: 3600
`,
    'utf-8'
  );

  await fs.mkdir(path.join(skillDir, 'scripts'), { recursive: true });
  await fs.writeFile(
    path.join(skillDir, 'scripts', 'execute.ts'),
    `export const main = () => Math.floor(Math.random() * 6) + 1;`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    `## 概述
这是一个掷骰子技能。

## 用法
\`\`\`typescript
export const roll = () => Math.floor(Math.random() * 6) + 1;
\`\`\`
`,
    'utf-8'
  );

  return root;
};

describe('InstructionLoader', () => {
  let skillsRoot: string;

  afterEach(async () => {
    if (skillsRoot) {
      await fs.rm(skillsRoot, { recursive: true, force: true });
    }
  });

  it('loads and parses skill instructions with sections and code blocks', async () => {
    skillsRoot = await createTempSkill();

    const index = new SkillsIndex({
      skillsRoot,
      metadataProvider: new MetadataLoader()
    });
    await index.buildIndex();

    const cache = new SkillsCache();
    const loader = new InstructionLoader(index, cache);

    const content = await loader.loadInstruction('dice');
    expect(content).toBeDefined();
    expect(content?.sections).toHaveLength(2);
    expect(content?.codeBlocks).toHaveLength(1);
    expect(content?.codeBlocks[0].language).toBe('typescript');

    // Ensure caching works
    const cached = await loader.loadInstruction('dice');
    expect(cached).toBeDefined();
  });
});

