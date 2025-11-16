import { SkillsCache } from '../../src/core/skills/SkillsCache';
import type { SkillMetadata, SkillContent, SkillResources } from '../../src/types';

const sampleMetadata: SkillMetadata = {
  name: 'dice',
  displayName: 'Dice Roller',
  description: 'Roll dice with configurable sides.',
  version: '1.0.0',
  type: 'direct',
  domain: 'entertainment',
  keywords: ['dice', 'random'],
  permissions: { network: false },
  cacheable: true,
  ttl: 3600,
  path: '/tmp/dice',
  loadedAt: Date.now()
};

const sampleContent: SkillContent = {
  name: 'dice',
  raw: '# Dice Skill',
  sections: [{ title: 'Overview', body: 'Roll dice.' }],
  codeBlocks: [{ language: 'typescript', code: 'export const roll = () => 4;' }],
  path: '/tmp/dice/SKILL.md',
  loadedAt: Date.now()
};

const sampleResources: SkillResources = {
  scripts: [
    { name: 'main.ts', path: 'scripts/main.ts', content: 'export {};', size: 10, language: 'ts' }
  ],
  assets: [
    { name: 'config.json', path: 'assets/config.json', size: 20, mimeType: 'application/json' }
  ],
  dependencies: [],
  loadedAt: Date.now()
};

describe('SkillsCache', () => {
  it('caches metadata, content, and resources with stats tracking', () => {
    const cache = new SkillsCache({
      config: {
        metadata: { maxSize: 2, ttl: 1000 },
        content: { maxSize: 2, ttl: 1000 },
        resources: { maxSize: 2, ttl: 1000 }
      }
    });

    expect(cache.getMetadata('dice')).toBeUndefined();
    cache.setMetadata('dice', sampleMetadata);
    expect(cache.getMetadata('dice')?.name).toBe('dice');

    cache.setContent('dice', sampleContent);
    expect(cache.getContent('dice')?.sections.length).toBe(1);

    cache.setResources('dice', sampleResources);
    expect(cache.getResources('dice')?.scripts).toHaveLength(1);

    const stats = cache.getStats();
    expect(stats.metadata.hits).toBe(1);
    expect(stats.metadata.misses).toBe(1);
    expect(stats.content.hits).toBe(1);
    expect(stats.resources.hits).toBe(1);
  });

  it('expires entries based on ttl', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    const cache = new SkillsCache({
      config: {
        metadata: { maxSize: 2, ttl: 1000 },
        content: { maxSize: 2, ttl: 1000 },
        resources: { maxSize: 2, ttl: 1000 }
      }
    });

    cache.setMetadata('dice', sampleMetadata);
    expect(cache.getMetadata('dice')).toBeDefined();

    jest.advanceTimersByTime(1001);
    expect(cache.getMetadata('dice')).toBeUndefined();

    jest.useRealTimers();
  });
});

