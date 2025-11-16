import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MetadataLoader, MetadataLoaderError } from '../../src/core/skills/MetadataLoader';
import type { SkillMetadata } from '../../src/types';

const createTempSkillDir = async (
  files: Record<string, string>
): Promise<string> => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'metadata-loader-'));
  await Promise.all(
    Object.entries(files).map(async ([fileName, content]) => {
      const fullPath = path.join(tempRoot, fileName);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    })
  );
  return tempRoot;
};

const removeTempDir = async (dir: string): Promise<void> => {
  await fs.rm(dir, { recursive: true, force: true });
};

describe('MetadataLoader', () => {
  let loader: MetadataLoader;

  beforeEach(() => {
    loader = new MetadataLoader();
  });

  it('should load metadata from METADATA.yml', async () => {
    const skillDir = await createTempSkillDir({
      'METADATA.yml': `
name: dice
displayName: 骰子大师
description: 掷骰子工具
version: 1.2.0
type: direct
domain: entertainment
keywords:
  - dice
  - random
permissions:
  network: false
  filesystem: none
ttl: 7200
cacheable: true
`,
      'SKILL.md': '# metadata-backed skill'
    });

    let metadata: SkillMetadata | undefined;

    try {
      metadata = await loader.loadMetadata(skillDir);
    } finally {
      await removeTempDir(skillDir);
    }

    expect(metadata).toBeDefined();
    expect(metadata?.name).toBe('dice');
    expect(metadata?.displayName).toBe('骰子大师');
    expect(metadata?.keywords).toEqual(['dice', 'random']);
    expect(metadata?.permissions).toEqual({
      network: false,
      filesystem: 'none'
    });
    expect(metadata?.ttl).toBe(7200);
    expect(metadata?.cacheable).toBe(true);
    expect(metadata?.path).toBe(path.resolve(skillDir));
    expect(metadata?.loadedAt).toEqual(expect.any(Number));
  });

  it('should fallback to front matter in SKILL.md when METADATA.yml is missing', async () => {
    const skillDir = await createTempSkillDir({
      'SKILL.md': `---
name: dice
displayName: 掷骰子
description: 掷骰子工具
version: 1.0.0
type: direct
domain: entertainment
keywords:
  - dice
  - roll
permissions:
  network: false
---

# 掷骰子
正文内容...
`
    });

    let metadata: SkillMetadata | undefined;

    try {
      metadata = await loader.loadMetadata(skillDir);
    } finally {
      await removeTempDir(skillDir);
    }

    expect(metadata).toBeDefined();
    expect(metadata?.keywords).toEqual(['dice', 'roll']);
    expect(metadata?.cacheable).toBe(true);
    expect(metadata?.ttl).toBe(3600);
  });

  it('should throw validation error when required fields are missing', async () => {
    const skillDir = await createTempSkillDir({
      'METADATA.yml': `
displayName: 缺少必填项
description: 测试缺少name
version: 1.0.0
type: direct
domain: test
keywords: []
cacheable: true
ttl: 3600
`,
      'SKILL.md': '# invalid skill'
    });

    await expect(loader.loadMetadata(skillDir)).rejects.toThrow(MetadataLoaderError);

    try {
      await loader.loadMetadata(skillDir);
    } catch (error) {
      const metadataError = error as MetadataLoaderError;
      expect(metadataError.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'keywords' })
        ])
      );
    } finally {
      await removeTempDir(skillDir);
    }
  });
});

