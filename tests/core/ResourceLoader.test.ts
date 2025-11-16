import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MetadataLoader } from '../../src/core/skills/MetadataLoader';
import { SkillsIndex } from '../../src/core/skills/SkillsIndex';
import { SkillsCache } from '../../src/core/skills/SkillsCache';
import { ResourceLoader } from '../../src/core/skills/ResourceLoader';

const createTempSkill = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'resource-loader-'));
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

  await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Dice Skill', 'utf-8');

  const scriptsDir = path.join(skillDir, 'scripts');
  const assetsDir = path.join(skillDir, 'assets');
  await fs.mkdir(scriptsDir);
  await fs.mkdir(assetsDir);

  await fs.writeFile(
    path.join(scriptsDir, 'main.ts'),
    'export const roll = () => 4;',
    'utf-8'
  );
  await fs.writeFile(
    path.join(assetsDir, 'config.json'),
    JSON.stringify({ sides: 6 }),
    'utf-8'
  );

  return root;
};

describe('ResourceLoader', () => {
  let skillsRoot: string;

  afterEach(async () => {
    if (skillsRoot) {
      await fs.rm(skillsRoot, { recursive: true, force: true });
    }
  });

  it('loads script and asset resources for a skill', async () => {
    skillsRoot = await createTempSkill();

    const index = new SkillsIndex({
      skillsRoot,
      metadataProvider: new MetadataLoader()
    });
    await index.buildIndex();

    const cache = new SkillsCache();
    const loader = new ResourceLoader(index, cache);

    const resources = await loader.loadResources('dice');
    expect(resources).toBeDefined();
    expect(resources?.scripts).toHaveLength(1);
    expect(resources?.assets).toHaveLength(1);
    expect(resources?.scripts[0].content).toContain('roll');

    // Cached call
    const cached = await loader.loadResources('dice');
    expect(cached?.scripts).toHaveLength(1);
  });
});

