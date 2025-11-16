import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  MetadataLoader,
  SkillsCache,
  SkillsIndex,
  InstructionLoader,
  ResourceLoader,
  SkillsLoader
} from '../../src/core/skills';
import type { SkillMetadata } from '../../src/types';

const createTempSkill = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-loader-'));
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

  await fs.writeFile(
    path.join(skillDir, 'SKILL.md'),
    `## 概述
掷骰子技能`,
    'utf-8'
  );

  await fs.mkdir(path.join(skillDir, 'scripts'));
  await fs.writeFile(
    path.join(skillDir, 'scripts', 'main.ts'),
    'export const roll = () => 4;',
    'utf-8'
  );

  return root;
};

describe('SkillsLoader', () => {
  let skillsRoot: string;

  afterEach(async () => {
    if (skillsRoot) {
      await fs.rm(skillsRoot, { recursive: true, force: true });
    }
  });

  it('loads metadata, instructions, and resources', async () => {
    skillsRoot = await createTempSkill();

    const index = new SkillsIndex({
      skillsRoot,
      metadataProvider: new MetadataLoader()
    });
    await index.buildIndex();

    const cache = new SkillsCache();
    const instructionLoader = new InstructionLoader(index, cache);
    const resourceLoader = new ResourceLoader(index, cache);
    const loader = new SkillsLoader(index, instructionLoader, resourceLoader, cache);

    const result = await loader.loadSkill('dice', {
      includeContent: true,
      includeResources: true
    });

    expect(result).toBeDefined();
    expect(result?.metadata.name).toBe('dice');
    expect(result?.content).toBeDefined();
    expect(result?.resources?.scripts).toHaveLength(1);
  });

  it('routes content and resource loading through concurrency controller', async () => {
    const metadata: SkillMetadata = {
      name: 'demo',
      displayName: 'Demo',
      description: 'test',
      version: '1.0.0',
      type: 'direct',
      category: 'test',
      domain: 'testing',
      keywords: ['test'],
      permissions: {},
      cacheable: true,
      ttl: 60_000,
      path: '/tmp/demo',
      loadedAt: Date.now()
    };

    const index = {
      getMetadata: jest.fn().mockReturnValue(metadata)
    } as unknown as SkillsIndex;

    const cache = new SkillsCache();
    const instructionLoader = {
      loadInstruction: jest.fn().mockResolvedValue(undefined)
    } as unknown as InstructionLoader;
    const resourceLoader = {
      loadResources: jest.fn().mockResolvedValue(undefined)
    } as unknown as ResourceLoader;

    const loader = new SkillsLoader(index, instructionLoader, resourceLoader, cache);
    const concurrencyMock = {
      loadWithDeduplication: jest
        .fn()
        .mockImplementation(async (_key: string, fn: () => Promise<any>) => fn())
    };
    (loader as unknown as { concurrency: typeof concurrencyMock }).concurrency = concurrencyMock;

    await loader.loadSkill('demo', { includeContent: true, includeResources: true });

    expect(concurrencyMock.loadWithDeduplication).toHaveBeenCalledWith(
      'content:demo',
      expect.any(Function)
    );
    expect(concurrencyMock.loadWithDeduplication).toHaveBeenCalledWith(
      'resources:demo',
      expect.any(Function)
    );
  });
});
