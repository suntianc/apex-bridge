import {
  SkillLoadOptions,
  SkillLoadResult,
  SkillMetadata
} from '../../types';
import logger from '../../utils/logger';
import { SkillsIndex } from './SkillsIndex';
import { SkillsCache } from './SkillsCache';
import { InstructionLoader } from './InstructionLoader';
import { ResourceLoader } from './ResourceLoader';
import { LoadingConcurrencyController } from './LoadingConcurrencyController';
import { ABPSkillsAdapter } from './ABPSkillsAdapter';

export interface SkillsLoaderOptions {
  cache?: SkillsCache;
  maxConcurrentLoads?: number;
}

export class SkillsLoader {
  private readonly skillsIndex: SkillsIndex;
  private readonly cache: SkillsCache;
  private readonly instructions: InstructionLoader;
  private readonly resources: ResourceLoader;
  private readonly concurrency: LoadingConcurrencyController;
  private readonly abpAdapter: ABPSkillsAdapter;

  constructor(
    skillsIndex: SkillsIndex,
    instructionLoader: InstructionLoader,
    resourceLoader: ResourceLoader,
    cacheOrOptions?: SkillsCache | SkillsLoaderOptions,
    options?: SkillsLoaderOptions
  ) {
    this.skillsIndex = skillsIndex;
    this.instructions = instructionLoader;
    this.resources = resourceLoader;

    let cache: SkillsCache | undefined;
    let resolvedOptions: SkillsLoaderOptions = {};

    if (cacheOrOptions instanceof SkillsCache) {
      cache = cacheOrOptions;
      resolvedOptions = options ?? {};
    } else {
      resolvedOptions = cacheOrOptions ?? {};
      cache = resolvedOptions.cache;
    }

    this.cache = cache ?? new SkillsCache();
    this.concurrency = new LoadingConcurrencyController(resolvedOptions.maxConcurrentLoads ?? 5);
    this.abpAdapter = new ABPSkillsAdapter();
  }

  async loadSkill(skillName: string, options: SkillLoadOptions = {}): Promise<SkillLoadResult | undefined> {
    const metadata = await this.ensureMetadata(skillName);
    if (!metadata) {
      return undefined;
    }

    const result: SkillLoadResult = {
      metadata
    };

    const loaders: Array<Promise<void>> = [];

    if (options.includeContent) {
      loaders.push(
        this.concurrency
          .loadWithDeduplication(`content:${skillName}`, () => this.instructions.loadInstruction(skillName))
          .then((content) => {
            if (content) {
              result.content = content;
            }
          })
      );
    }

    if (options.includeResources) {
      loaders.push(
        this.concurrency
          .loadWithDeduplication(`resources:${skillName}`, () => this.resources.loadResources(skillName))
          .then((resourceSet) => {
            if (resourceSet) {
              result.resources = resourceSet;
            }
          })
      );
    }

    if (loaders.length > 0) {
      await Promise.all(loaders);
    }

    return result;
  }

  getCache(): SkillsCache {
    return this.cache;
  }

  /**
   * 检测协议类型
   * 
   * @param skillName - Skill名称
   * @returns 协议类型（'vcp' | 'abp'）
   */
  detectProtocol(skillName: string): 'vcp' | 'abp' {
    const metadata = this.skillsIndex.getMetadata(skillName);
    if (!metadata) {
      return 'vcp'; // 默认使用VCP协议
    }

    return this.abpAdapter.detectProtocol(metadata);
  }

  /**
   * 转换为ABP格式
   * 
   * @param skillName - Skill名称
   * @returns ABP格式的Skill元数据，如果转换失败返回undefined
   */
  convertToABP(skillName: string): SkillMetadata | undefined {
    const metadata = this.skillsIndex.getMetadata(skillName);
    if (!metadata) {
      logger.warn(`[SkillsLoader] 未找到技能元数据: ${skillName}`);
      return undefined;
    }

    return this.abpAdapter.convertToABP(metadata);
  }

  /**
   * 获取ABP工具定义
   * 
   * @param skillName - Skill名称
   * @returns ABP工具定义列表
   */
  getABPToolDefinitions(skillName: string): import('../../types/abp').ABPToolDefinition[] {
    const metadata = this.skillsIndex.getMetadata(skillName);
    if (!metadata) {
      logger.warn(`[SkillsLoader] 未找到技能元数据: ${skillName}`);
      return [];
    }

    return this.abpAdapter.getABPToolDefinitions(metadata);
  }

  /**
   * 验证ABP格式
   * 
   * @param skillName - Skill名称
   * @returns 验证结果
   */
  validateABPFormat(skillName: string): { valid: boolean; errors: string[] } {
    const metadata = this.skillsIndex.getMetadata(skillName);
    if (!metadata) {
      return {
        valid: false,
        errors: [`未找到技能元数据: ${skillName}`]
      };
    }

    return this.abpAdapter.validateABPFormat(metadata);
  }

  findSkillsByIntent(
    intent: string,
    options?: import('../../types').SkillSearchOptions
  ): Promise<import('../../types').SkillSearchResult[]> {
    return this.skillsIndex.findRelevantSkills(intent, options);
  }

  private async ensureMetadata(skillName: string): Promise<SkillMetadata | undefined> {
    const cached = this.cache.getMetadata(skillName);
    const latest = this.skillsIndex.getMetadata(skillName);

    if (!latest) {
      logger.warn(`[SkillsLoader] 未找到技能元数据: ${skillName}`);
      return undefined;
    }

    if (!cached || this.hasMetadataChanged(cached, latest)) {
      // 元数据发生变化，清理缓存以确保内容/资源重新加载
      this.cache.clear(skillName);
      this.cache.setMetadata(skillName, latest);
      return latest;
    }

    return cached;
  }

  private hasMetadataChanged(current: SkillMetadata, latest: SkillMetadata): boolean {
    if (current.version !== latest.version) {
      return true;
    }
    if (current.loadedAt !== latest.loadedAt) {
      return true;
    }
    if (current.updatedAt !== latest.updatedAt) {
      return true;
    }
    return false;
  }
}
