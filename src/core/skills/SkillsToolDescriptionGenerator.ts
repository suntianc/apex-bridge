import { TTLCache } from '../../utils/TTLCache';
import { SkillsIndex } from './SkillsIndex';
import { InstructionLoader } from './InstructionLoader';
import { SkillMetadata, SkillContent } from '../../types';
import logger from '../../utils/logger';

type Phase = 'metadata' | 'brief' | 'full';

interface DescriptionCaches {
  metadata: TTLCache<string, string>;
  brief: TTLCache<string, string>;
  full: TTLCache<string, string>;
}

interface GeneratorOptions {
  cache?: {
    metadataTtlMs?: number; // default: 24h
    briefTtlMs?: number;    // default: 30m
    fullTtlMs?: number;     // default: 15m
    maxSize?: number;       // default: 512/256/128 per phase
  };
  thresholds?: {
    toBrief?: number;       // default: 0.15
    toFull?: number;        // default: 0.7
  };
}

const DEFAULT_CACHE = {
  metadata: { ttl: 1000 * 60 * 60 * 24, maxSize: 512 }, // 24h
  brief: { ttl: 1000 * 60 * 30, maxSize: 256 },         // 30m
  full: { ttl: 1000 * 60 * 15, maxSize: 128 }           // 15m
};

const DEFAULT_THRESHOLDS = {
  toBrief: 0.15,
  toFull: 0.7
};

export class SkillsToolDescriptionGenerator {
  private readonly index: SkillsIndex;
  private readonly instructions: InstructionLoader;
  private readonly caches: DescriptionCaches;
  private readonly thresholds: Required<GeneratorOptions['thresholds']>;

  constructor(index: SkillsIndex, instructionLoader: InstructionLoader, options: GeneratorOptions = {}) {
    this.index = index;
    this.instructions = instructionLoader;

    const metadataTtl = options.cache?.metadataTtlMs ?? DEFAULT_CACHE.metadata.ttl;
    const briefTtl = options.cache?.briefTtlMs ?? DEFAULT_CACHE.brief.ttl;
    const fullTtl = options.cache?.fullTtlMs ?? DEFAULT_CACHE.full.ttl;
    const maxSize = options.cache?.maxSize;

    this.caches = {
      metadata: new TTLCache<string, string>({
        ttl: metadataTtl,
        maxSize: maxSize ?? DEFAULT_CACHE.metadata.maxSize
      }),
      brief: new TTLCache<string, string>({
        ttl: briefTtl,
        maxSize: maxSize ?? DEFAULT_CACHE.brief.maxSize
      }),
      full: new TTLCache<string, string>({
        ttl: fullTtl,
        maxSize: maxSize ?? DEFAULT_CACHE.full.maxSize
      })
    };

    this.thresholds = {
      toBrief: options.thresholds?.toBrief ?? DEFAULT_THRESHOLDS.toBrief,
      toFull: options.thresholds?.toFull ?? DEFAULT_THRESHOLDS.toFull
    };
  }

  async getMetadataDescription(skillName: string): Promise<string> {
    const cached = this.caches.metadata.get(skillName);
    if (cached) return cached;

    const meta = this.index.getMetadata(skillName) ?? (await this.index.reloadSkill(skillName));
    if (!meta) {
      const msg = `技能不存在: ${skillName}`;
      logger.warn(`[SkillsToolDescriptionGenerator] ${msg}`);
      const fallback = `# ${skillName}\n\nNo description`;
      this.caches.metadata.set(skillName, fallback);
      return fallback;
    }

    const text = this.composeMetadataDescription(meta);
    this.caches.metadata.set(skillName, text);
    return text;
  }

  async getBriefDescription(skillName: string): Promise<string> {
    const cached = this.caches.brief.get(skillName);
    if (cached) return cached;

    const meta = this.index.getMetadata(skillName) ?? (await this.index.reloadSkill(skillName));
    if (!meta) {
      return this.getMetadataDescription(skillName);
    }

    const text = this.composeBriefDescription(meta);
    this.caches.brief.set(skillName, text);
    return text;
  }

  async getFullDescription(skillName: string): Promise<string> {
    const cached = this.caches.full.get(skillName);
    if (cached) return cached;

    const meta = this.index.getMetadata(skillName) ?? (await this.index.reloadSkill(skillName));
    const content = await this.instructions.loadInstruction(skillName);
    if (!meta && !content) {
      return this.getMetadataDescription(skillName);
    }

    const text = this.composeFullDescription(meta, content);
    this.caches.full.set(skillName, text);
    return text;
  }

  async getDescriptionByConfidence(skillName: string, confidence?: number): Promise<string> {
    if (typeof confidence !== 'number') {
      return this.getMetadataDescription(skillName);
    }
    if (confidence >= this.thresholds.toFull) {
      return this.getFullDescription(skillName);
    }
    if (confidence >= this.thresholds.toBrief) {
      return this.getBriefDescription(skillName);
    }
    return this.getMetadataDescription(skillName);
  }

  async getDescriptionByPhase(skillName: string, phase: Phase): Promise<string> {
    switch (phase) {
      case 'full':
        return this.getFullDescription(skillName);
      case 'brief':
        return this.getBriefDescription(skillName);
      case 'metadata':
      default:
        return this.getMetadataDescription(skillName);
    }
  }

  private composeMetadataDescription(meta: SkillMetadata): string {
    const header = `# ${meta.displayName || meta.name}`;
    const desc = meta.description ? `\n\n${meta.description}` : '\n\nNo description';
    return `${header}${desc}`;
  }

  private composeBriefDescription(meta: SkillMetadata): string {
    const header = `# ${meta.displayName || meta.name}`;
    const desc = meta.description ? `\n\n${meta.description}` : '';

    // 从 ABP 工具定义提取参数（如存在）
    const abpTools = meta.abp?.tools ?? [];
    const lines: string[] = [header, desc];

    if (abpTools.length > 0) {
      for (const tool of abpTools) {
        lines.push(`\n## ${tool.name}`);
        if (tool.description) {
          lines.push(`\n${tool.description}`);
        }
        if (tool.parameters && Object.keys(tool.parameters).length > 0) {
          lines.push(`\n### Parameters`);
          for (const [name, param] of Object.entries(tool.parameters)) {
            const type = (param as any)?.type ?? 'any';
            const pdesc = (param as any)?.description ?? '';
            const required = (param as any)?.required === false ? '' : ' (required)';
            lines.push(`- \`${name}\` <${type}>${required}${pdesc ? ` - ${pdesc}` : ''}`);
          }
        }
      }
    }

    return lines.join('\n');
  }

  private composeFullDescription(meta?: SkillMetadata, content?: SkillContent): string {
    const parts: string[] = [];
    if (meta) {
      parts.push(this.composeBriefDescription(meta));
    }
    if (content) {
      parts.push('\n---\n');
      parts.push('## Instructions\n');
      parts.push(content.raw.trim());
    }
    return parts.length > 0 ? parts.join('\n') : '# Skill\n\nNo description';
  }
}


