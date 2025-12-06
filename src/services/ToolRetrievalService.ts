/**
 * ToolRetrievalService - 工具检索服务
 * 提供LanceDB向量数据库和语义搜索能力
 */

import * as lancedb from '@lancedb/lancedb';
import { Index } from '@lancedb/lancedb';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import {
  ToolRetrievalConfig,
  SkillTool,
  ToolRetrievalResult,
  ToolError,
  ToolErrorCode,
  ToolType
} from '../types/tool-system';
import { LLMModelType } from '../types/llm-models';
import { logger } from '../utils/logger';
import { LLMConfigService } from './LLMConfigService';

// 导入transformers.js用于本地嵌入模型
let transformers: any = null;
let embeddingPipeline: any = null;
let embeddingModel: string | null = null;

/**
 * Skills向量表接口
 */
interface SkillsTable {
  id: string;
  name: string;
  description: string;
  tags: string[];
  path: string;
  version: string;
  metadata: Record<string, any>;
  vector: number[];
  indexedAt: Date;
}

/**
 * 工具检索服务
 */
export class ToolRetrievalService {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private config: ToolRetrievalConfig;
  private isInitialized = false;
  private embeddingModelConfig: any = null;
  private providerConfig: any = null;

  constructor(config: ToolRetrievalConfig) {
    this.config = config;
    logger.info('ToolRetrievalService created with config:', {
      vectorDbPath: config.vectorDbPath,
      model: config.model,
      dimensions: config.dimensions
    });
  }

  /**
   * 初始化LanceDB连接和向量表
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('ToolRetrievalService is already initialized');
      return;
    }

    const startTime = Date.now();

    try {
      logger.info('Initializing ToolRetrievalService...');

      // 1. 连接到LanceDB
      await this.connectToLanceDB();

      // 2. 加载Embedding模型配置
      await this.loadEmbeddingModelConfig();

      // 3. 创建或打开向量表
      await this.initializeSkillsTable();

      this.isInitialized = true;

      const duration = Date.now() - startTime;
      logger.info(`ToolRetrievalService initialized in ${duration}ms`);

    } catch (error) {
      logger.error('ToolRetrievalService initialization failed:', error);
      throw new ToolError(
        `ToolRetrievalService initialization failed: ${this.formatError(error)}`,
        ToolErrorCode.VECTOR_DB_ERROR
      );
    }
  }

  /**
   * 连接到LanceDB
   */
  private async connectToLanceDB(): Promise<void> {
    try {
      // 确保数据库目录存在
      await fs.mkdir(this.config.vectorDbPath, { recursive: true });

      // 连接到LanceDB
      this.db = await lancedb.connect(this.config.vectorDbPath);

      logger.info(`Connected to LanceDB at: ${this.config.vectorDbPath}`);

    } catch (error) {
      logger.error('Failed to connect to LanceDB:', error);
      throw new ToolError(
        `Failed to connect to LanceDB: ${this.formatError(error)}`,
        ToolErrorCode.VECTOR_DB_ERROR
      );
    }
  }

  /**
   * 加载Embedding模型配置
   */
  private async loadEmbeddingModelConfig(): Promise<void> {
    try {
      const llmConfigService = LLMConfigService.getInstance();

      // 获取默认的Embedding模型配置
      this.embeddingModelConfig = await llmConfigService.getDefaultModel(LLMModelType.EMBEDDING);

      if (!this.embeddingModelConfig) {
        logger.warn('No default embedding model found, will create default configuration');
        await this.ensureDefaultEmbeddingModel();
        return;
      }

      this.providerConfig = await llmConfigService.getProvider(
        this.embeddingModelConfig.providerId
      );

      logger.info('Loaded embedding model configuration:', {
        modelKey: this.embeddingModelConfig.modelKey,
        modelType: this.embeddingModelConfig.modelType,
        isLocal: this.embeddingModelConfig.modelConfig?.local
      });

    } catch (error) {
      logger.error('Failed to load embedding model configuration:', error);
      throw error;
    }
  }

  /**
   * 确保存在默认的Embedding模型配置
   */
  private async ensureDefaultEmbeddingModel(): Promise<void> {
    logger.warn('Embedding model auto-creation is not implemented yet. Please configure embedding model manually.');
    throw new Error('No embedding model configured');
  }

  /**
   * 初始化Skills向量表
   */
  private async initializeSkillsTable(): Promise<void> {
    try {
      const tableName = 'skills';

      // 检查表是否存在
      const tableNames = await this.getTableNames();

      if (tableNames.includes(tableName)) {
        // 表已存在，打开它
        this.table = await this.db!.openTable(tableName);
        logger.info(`Opened existing table: ${tableName}`);

        // 获取表中的记录数
        const count = await this.getTableCount();
        logger.info(`Table contains ${count} vector records`);
      } else {
        // 创建新表
        const schema = {
          id: 'string',
          name: 'string',
          description: 'string',
          tags: 'list',
          path: 'string',
          version: 'string',
          metadata: 'object',
          vector: 'vector',
          indexedAt: 'timestamp'
        };

        // 创建空表 - 向量列会在插入数据时自动检测
        this.table = await this.db!.createTable(tableName, []);

        logger.info(`Created new table: ${tableName}`);
      }

      // 创建向量索引（如果不存在）
      await this.createVectorIndex();

    } catch (error) {
      logger.error('Failed to initialize Skills table:', error);
      throw error;
    }
  }

  /**
   * 创建向量索引
   */
  private async createVectorIndex(): Promise<void> {
    try {
      // 创建IVF_PQ索引以加速向量搜索
      await this.table!.createIndex('vector', {
        config: Index.ivfPq({
          numPartitions: 64, // 调整为适合数据集的大小
          numSubVectors: 8
        }),
        replace: true
      });

      logger.info('Created vector index for Skills table');
    } catch (error) {
      // 索引可能已经存在，忽略错误
      logger.debug('Vector index may already exist:', error);
    }
  }

  /**
   * 获取表名列表
   */
  private async getTableNames(): Promise<string[]> {
    if (!this.db) {
      return [];
    }

    try {
      // LanceDB的连接对象可能有不同的API
      // 这里假设可以直接访问表列表
      return [];
    } catch (error) {
      logger.warn('Failed to get table names:', error);
      return [];
    }
  }

  /**
   * 获取表的记录数
   */
  private async getTableCount(): Promise<number> {
    try {
      if (!this.table) {
        return 0;
      }

      // 使用count查询
      const count = await this.table.countRows();
      return count;
    } catch (error) {
      logger.warn('Failed to get table count:', error);
      return 0;
    }
  }

  /**
   * 为Skills生成向量嵌入
   */
  async getEmbedding(skill: {
    name: string;
    description: string;
    tags: string[];
  }): Promise<number[]> {
    try {
      logger.debug(`Generating embedding for skill: ${skill.name}`);

      // 检查是否需要使用本地嵌入模型
      if (this.embeddingModelConfig?.modelConfig?.local) {
        return await this.generateLocalEmbedding(skill);
      } else {
        return await this.generateRemoteEmbedding(skill);
      }

    } catch (error) {
      logger.error(`Failed to generate embedding for ${skill.name}:`, error);
      throw new ToolError(
        `Embedding generation failed: ${this.formatError(error)}`,
        ToolErrorCode.EMBEDDING_MODEL_ERROR
      );
    }
  }

  /**
   * 使用本地嵌入模型生成向量
   */
  private async generateLocalEmbedding(skill: {
    name: string;
    description: string;
    tags: string[];
  }): Promise<number[]> {
    try {
      // 延迟加载transformers.js（首次调用时加载）
      if (!transformers) {
        logger.info('Loading transformers.js for local embedding...');
        transformers = await import('@xenova/transformers');
      }

      // 加载或获取嵌入管道
      const modelName = this.embeddingModelConfig.modelKey;
      if (!embeddingPipeline || embeddingModel !== modelName) {
        logger.info(`Loading embedding model: ${modelName}`);

        const modelPath = this.embeddingModelConfig.modelConfig.modelPath;

        embeddingPipeline = await transformers.pipeline(
          'feature-extraction',
          modelPath
        );

        embeddingModel = modelName;
        logger.info(`Embedding model loaded: ${modelName}`);
      }

      // 准备文本（名称 + 描述 + 标签）
      const text = this.prepareEmbeddingText(skill);

      // 生成向量
      const result = await embeddingPipeline(text);

      // 转换为数组并归一化
      const vector = await this.normalizeVector(result);

      logger.debug(`Generated local embedding: ${vector.length} dimensions`);

      return vector;

    } catch (error) {
      logger.error('Local embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * 使用远程API生成嵌入
   */
  private async generateRemoteEmbedding(skill: {
    name: string;
    description: string;
    tags: string[];
  }): Promise<number[]> {
    try {
      // 这里应该调用LLMManager.embed()方法
      // 暂时使用本地模型作为后备
      logger.warn('Remote embedding not implemented, falling back to local');
      return await this.generateLocalEmbedding(skill);
    } catch (error) {
      logger.error('Remote embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * 准备嵌入文本
   */
  private prepareEmbeddingText(skill: {
    name: string;
    description: string;
    tags: string[];
  }): string {
    const parts = [
      skill.name,
      skill.description,
      ...(skill.tags || [])
    ];

    return parts.join(' ').trim();
  }

  /**
   * 归一化向量
   */
  private async normalizeVector(tensor: any): Promise<number[]> {
    // 从tensor中提取数据
    const data = await this.extractTensorData(tensor);

    // 归一化
    const norm = Math.sqrt(data.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) return data;

    return data.map(val => val / norm);
  }

  /**
   * 从tensor提取数据
   */
  private async extractTensorData(tensor: any): Promise<number[]> {
    // 处理不同的tensor格式
    if (Array.isArray(tensor)) {
      return tensor;
    }

    if (tensor.data) {
      return Array.from(tensor.data);
    }

    if (tensor.tolist) {
      return await tensor.tolist();
    }

    throw new Error('Unsupported tensor format');
  }

  /**
   * 索引Skills（插入向量到数据库）
   */
  async indexSkill(skill: {
    name: string;
    description: string;
    tags: string[];
    path: string;
    version?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      logger.info(`Indexing skill: ${skill.name}`);

      // 生成唯一ID
      const skillId = this.generateSkillId(skill.name);

      // 生成向量嵌入
      const vector = await this.getEmbedding(skill);

      // 准备记录数据
      const record: SkillsTable = {
        id: skillId,
        name: skill.name,
        description: skill.description,
        tags: skill.tags || [],
        path: skill.path,
        version: skill.version || '1.0.0',
        metadata: skill.metadata || {},
        vector,
        indexedAt: new Date()
      };

      // 检查是否已存在（更新模式）
      await this.removeSkill(skill.name);

      // 插入到向量表 - 使用类型断言适配 LanceDB API
      await this.table!.add([record as unknown as Record<string, unknown>]);

      logger.info(`Skill indexed successfully: ${skill.name} (${vector.length} dimensions)`);

    } catch (error) {
      logger.error(`Failed to index skill ${skill.name}:`, error);
      throw error;
    }
  }

  /**
   * 生成Skills ID
   */
  private generateSkillId(name: string): string {
    return createHash('md5')
      .update(name)
      .digest('hex');
  }

  /**
   * 从向量表中删除Skills
   */
  async removeSkill(skillName: string): Promise<void> {
    try {
      const skillId = this.generateSkillId(skillName);

      // 删除记录（LanceDB没有直接的删除API，需要使用覆盖）
      // 这里暂时记录日志
      logger.debug(`Removing skill: ${skillName} (id: ${skillId})`);

    } catch (error) {
      logger.warn(`Failed to remove skill ${skillName}:`, error);
      // 不抛出错误，允许继续执行
    }
  }

  /**
   * 搜索相关Skills
   */
  async findRelevantSkills(
    query: string,
    limit: number = 5,
    threshold: number = 0.6
  ): Promise<ToolRetrievalResult[]> {
    try {
      logger.info(`Searching relevant skills for query: "${query}"`);

      // 生成查询向量
      const queryVector = await this.getEmbedding({
        name: query,
        description: query,
        tags: []
      });

      // 执行向量搜索
      const results = await this.table!
        .search(queryVector)
        .limit(limit * 2) // 获取多一些结果以应用阈值过滤
        .toArray();

      // 格式化和过滤结果
      const formattedResults = await this.formatSearchResults(results, limit, threshold);

      logger.info(`Found ${formattedResults.length} relevant skill(s)`);

      return formattedResults;

    } catch (error) {
      logger.error(`Skills search failed for query "${query}":`, error);
      throw new ToolError(
        `Skills search failed: ${this.formatError(error)}`,
        ToolErrorCode.VECTOR_DB_ERROR
      );
    }
  }

  /**
   * 格式化搜索结果
   */
  private async formatSearchResults(
    results: any,
    limit: number,
    threshold: number
  ): Promise<ToolRetrievalResult[]> {
    const formatted: ToolRetrievalResult[] = [];

    // LanceDB返回的结果格式可能不同
    // 这里假设results是一个数组
    const resultArray = Array.isArray(results) ? results : [results];

    for (const result of resultArray.slice(0, limit)) {
      try {
        // 获取相似度分数
        const score = result.score || result.similarity || 0;

        // 应用阈值过滤
        if (score < threshold) {
          continue;
        }

        // 获取数据
        const data: SkillsTable = result.item || result;

        // 转换为SkillTool格式
        const tool: SkillTool = {
          name: data.name,
          description: data.description,
          type: ToolType.SKILL,
          tags: data.tags,
          version: data.version,
          path: data.path,
          parameters: data.metadata?.parameters || { type: 'object', properties: {}, required: [] },
          enabled: true,
          level: 1
        };

        formatted.push({
          tool,
          score,
          reason: `Vector similarity: ${(score * 100).toFixed(2)}%`
        });

      } catch (error) {
        logger.warn('Failed to format search result:', error);
      }
    }

    return formatted;
  }

  /**
   * 扫描并索引所有已安装的Skills
   */
  async scanAndIndexAllSkills(skillsDir: string = './data/skills'): Promise<void> {
    try {
      logger.info(`Scanning skills directory: ${skillsDir}`);

      // 检查目录是否存在
      try {
        await fs.access(skillsDir);
      } catch (error) {
        logger.warn(`Skills directory does not exist: ${skillsDir}`);
        return;
      }

      // 获取所有Skills目录
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      const skillDirs = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

      logger.info(`Found ${skillDirs.length} skill directories`);

      // 索引每个Skills
      let indexedCount = 0;
      let skippedCount = 0;

      for (const skillName of skillDirs) {
        try {
          const skillPath = path.join(skillsDir, skillName);
          const vectorizedFile = path.join(skillPath, '.vectorized');

          // 检查.vectorized文件
          let needReindex = true;

          if (await this.fileExists(vectorizedFile)) {
            // 检查是否需要重新索引
            needReindex = await this.checkReindexRequired(skillPath, vectorizedFile);
          }

          if (needReindex) {
            // 读取SKILL.md
            const skillData = await this.readSkillMetadata(skillPath);

            // 索引Skills
            await this.indexSkill({
              ...skillData,
              path: skillPath
            });

            // 创建/更新.vectorized文件
            await this.updateVectorizedFile(vectorizedFile, skillPath);

            indexedCount++;
            logger.debug(`Indexed skill: ${skillName}`);
          } else {
            skippedCount++;
            logger.debug(`Skipping unchanged skill: ${skillName}`);
          }

        } catch (error) {
          logger.warn(`Failed to index skill ${skillName}:`, error);
        }
      }

      logger.info(`Skills scanning completed: ${indexedCount} indexed, ${skippedCount} skipped`);

    } catch (error) {
      logger.error('Failed to scan and index skills:', error);
      throw error;
    }
  }

  /**
   * 检查是否需要重新索引
   */
  private async checkReindexRequired(skillPath: string, vectorizedFile: string): Promise<boolean> {
    try {
      // 读取.vectorized文件
      const vectorizedContent = await fs.readFile(vectorizedFile, 'utf8');
      const vectorizedData = JSON.parse(vectorizedContent);

      // 计算当前SKILL.md的哈希
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      const skillContent = await fs.readFile(skillMdPath, 'utf8');
      const currentHash = createHash('md5').update(skillContent).digest('hex');
      const currentSize = Buffer.byteLength(skillContent);

      // 比较哈希和大小
      return currentHash !== vectorizedData.skillHash || currentSize !== vectorizedData.skillSize;

    } catch (error) {
      // 文件不存在或解析失败，需要索引
      return true;
    }
  }

  /**
   * 读取Skills元数据（从SKILL.md）
   */
  private async readSkillMetadata(skillPath: string): Promise<{
    name: string;
    description: string;
    tags: string[];
    version?: string;
  }> {
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    // 读取文件
    const content = await fs.readFile(skillMdPath, 'utf8');

    // 解析YAML Frontmatter（简化版本）
    const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);

    if (!yamlMatch) {
      throw new Error('No YAML Frontmatter found in SKILL.md');
    }

    const yamlContent = yamlMatch[1];

    // 简单的YAML解析（实际项目中应该使用专门的YAML解析库）
    const metadata = this.parseSimpleYaml(yamlContent);

    if (!metadata.name || !metadata.description) {
      throw new Error('SKILL.md must contain name and description');
    }

    return {
      name: metadata.name,
      description: metadata.description,
      tags: metadata.tags || [],
      version: metadata.version || '1.0.0'
    };
  }

  /**
   * 简单的YAML解析（用于演示）
   */
  private parseSimpleYaml(yamlContent: string): Record<string, any> {
    const result: Record<string, any> = {};
    const lines = yamlContent.split('\n');

    for (const line of lines) {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // 处理数组
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.substring(1, value.length - 1);
          result[key] = value.split(',').map((v: string) => v.trim());
        }
        // 处理字符串
        else if (value.startsWith('"') && value.endsWith('"')) {
          result[key] = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          result[key] = value.substring(1, value.length - 1);
        }
        // 处理数字
        else if (/^-?\d+\.?\d*$/.test(value)) {
          result[key] = parseFloat(value);
        }
        // 处理布尔值
        else if (value === 'true' || value === 'false') {
          result[key] = value === 'true';
        }
        // 普通字符串
        else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * 更新.vectorized文件
   */
  private async updateVectorizedFile(vectorizedFile: string, skillPath: string): Promise<void> {
    try {
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      const skillContent = await fs.readFile(skillMdPath, 'utf8');
      const skillHash = createHash('md5').update(skillContent).digest('hex');
      const skillSize = Buffer.byteLength(skillContent);

      const vectorizedData = {
        indexedAt: Date.now(),
        skillSize,
        skillHash
      };

      await fs.writeFile(vectorizedFile, JSON.stringify(vectorizedData, null, 2));

      logger.debug(`Updated .vectorized file: ${vectorizedFile}`);
    } catch (error) {
      logger.warn(`Failed to update .vectorized file:`, error);
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取服务统计信息
   */
  getStatistics() {
    return {
      initialized: this.isInitialized,
      config: this.config,
      embeddingModel: this.embeddingModelConfig?.modelKey || 'not-loaded'
    };
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up ToolRetrievalService...');

    // 关闭数据库连接
    if (this.db) {
      logger.debug('Closing LanceDB connection');
      this.db = null;
    }

    this.table = null;
    this.isInitialized = false;

    logger.info('ToolRetrievalService cleanup completed');
  }

  /**
   * 格式化错误信息
   */
  private formatError(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error occurred in ToolRetrievalService';
  }
}

/**
 * 工具检索服务实例（单例）
 */
let instance: ToolRetrievalService | null = null;

/**
 * 获取工具检索服务实例
 */
export function getToolRetrievalService(
  config?: ToolRetrievalConfig
): ToolRetrievalService {
  if (!instance) {
    if (!config) {
      // 使用默认配置
      config = {
        vectorDbPath: './.data/skills.lance',
        model: 'all-MiniLM-L6-v2',
        cacheSize: 1000,
        dimensions: 384,
        similarityThreshold: 0.6,
        maxResults: 10
      };
    }
    instance = new ToolRetrievalService(config);
  }
  return instance;
}

/**
 * 重置工具检索服务实例（用于测试）
 */
export function resetToolRetrievalService(): void {
  instance = null;
}