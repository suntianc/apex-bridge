import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MetadataLoader } from '../../src/core/skills/MetadataLoader';
import { SkillsIndex } from '../../src/core/skills/SkillsIndex';
import type { SkillMetadata } from '../../src/types';

const createTempSkillsRoot = async (
  skills: Record<string, { metadata?: string; skill?: string }>
): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-index-'));

  await Promise.all(
    Object.entries(skills).map(async ([dirName, files]) => {
      const skillDir = path.join(root, dirName);
      await fs.mkdir(skillDir, { recursive: true });

      if (files.metadata) {
        await fs.writeFile(path.join(skillDir, 'METADATA.yml'), files.metadata, 'utf-8');
      }

      if (files.skill) {
        await fs.writeFile(path.join(skillDir, 'SKILL.md'), files.skill, 'utf-8');
      } else {
        await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# stub skill', 'utf-8');
      }
    })
  );

  return root;
};

const removeDir = async (dir: string): Promise<void> => {
  await fs.rm(dir, { recursive: true, force: true });
};

describe('SkillsIndex', () => {
  let skillsRoot: string;

  afterEach(async () => {
    if (skillsRoot) {
      await removeDir(skillsRoot);
    }
  });

  it('builds index from skills directory and returns metadata', async () => {
    skillsRoot = await createTempSkillsRoot({
      dice: {
        metadata: `
name: dice
displayName: 骰子大师
description: 掷骰子工具，支持自定义面数
version: 1.0.0
type: direct
domain: entertainment
keywords: [dice, random, 掷骰子]
permissions:
  network: false
cacheable: true
ttl: 3600
`
      },
      weather: {
        skill: `---
name: weather
displayName: 天气查询
description: 查询城市天气和空气质量
version: 1.0.0
type: service
domain: information
keywords:
  - weather
  - 天气
permissions:
  network: true
---`
      }
    });

    const index = new SkillsIndex({
      skillsRoot,
      metadataProvider: new MetadataLoader()
    });

    await index.buildIndex();

    expect(index.getStats().totalSkills).toBe(2);

    const diceMetadata = index.getMetadata('dice');
    expect(diceMetadata?.displayName).toBe('骰子大师');
    expect(diceMetadata?.keywords).toContain('random');

    const weatherMetadata = index.getMetadata('weather');
    expect(weatherMetadata?.permissions.network).toBe(true);
    expect(index.getMetadata('unknown')).toBeUndefined();
  });

  it('finds relevant skills based on intent and ranking', async () => {
    skillsRoot = await createTempSkillsRoot({
      dice: {
        metadata: `
name: dice
displayName: 骰子大师
description: 掷骰子工具，支持自定义面数
version: 1.0.0
type: direct
domain: entertainment
keywords: [dice, random, 骰子]
permissions:
  network: false
cacheable: true
ttl: 3600
`
      },
      calculator: {
        metadata: `
name: calculator
displayName: 计算器
description: 四则运算和公式求解
version: 1.0.0
type: direct
domain: productivity
keywords: [calculate, 计算, math]
permissions:
  network: false
cacheable: true
ttl: 3600
`
      }
    });

    const index = new SkillsIndex({
      skillsRoot,
      metadataProvider: new MetadataLoader(),
      defaultSearchLimit: 5
    });

    await index.buildIndex();

    const results = await index.findRelevantSkills('帮我掷一个6面骰子');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].metadata.name).toBe('dice');
    expect(results[0].matchedKeywords).toContain('骰子');

    const calculatorResults = await index.findRelevantSkills('需要一个计算器来计算复杂公式');
    expect(calculatorResults[0].metadata.name).toBe('calculator');
  });

  it('reloads single skill after metadata change', async () => {
    skillsRoot = await createTempSkillsRoot({
      dice: {
        metadata: `
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
`
      }
    });

    const metadataLoader = new MetadataLoader();
    const index = new SkillsIndex({
      skillsRoot,
      metadataProvider: metadataLoader
    });

    await index.buildIndex();

    const metadataPath = path.join(skillsRoot, 'dice', 'METADATA.yml');
    await fs.writeFile(
      metadataPath,
      `
name: dice
displayName: 骰子大师 Pro
description: 掷骰子工具（升级版）
version: 1.1.0
type: direct
domain: entertainment
keywords: [dice, random, pro]
permissions:
  network: false
cacheable: true
ttl: 3600
`,
      'utf-8'
    );

    const reloaded = await index.reloadSkill('dice');
    expect(reloaded?.displayName).toBe('骰子大师 Pro');
    expect(reloaded?.keywords).toContain('pro');

    const stats = index.getStats();
    expect(stats.totalSkills).toBe(1);
  });
});

