/**
 * ToolRetrievalService - 工具检索服务
 * 提供LanceDB向量数据库和语义搜索能力
 */

import * as lancedb from '@lancedb/lancedb';
import { Index } from '@lancedb/lancedb';
import * as arrow from 'apache-arrow';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import matter from 'gray-matter';
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

// LLMManager 延迟导入，避免循环依赖
let llmManagerInstance: any = null;

/**
 * 工具向量表接口（支持 Skills 和 MCP 工具）
 */
interface ToolsTable {
  id: string;
  name: string;
  description: string;
  tags: string[];
  path?: string; // Skills 的路径，MCP 工具可能没有
  version?: string; // Skills 的版本，MCP 工具可能没有
  source?: string; // MCP 服务器 ID 或 skill 名称
  toolType: 'skill' | 'mcp' | 'builtin'; // 工具类型
  metadata: string; // JSON字符串格式
  vector: number[]; // 普通数组，不是 Float32Array
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
  private dimensionsCache: number | null = null;
  private llmConfigService: any = null;

  constructor(config: ToolRetrievalConfig) {
    this.config = config;
    logger.info('ToolRetrievalService created with config:', {
      vectorDbPath: config.vectorDbPath,
      model: config.model,
      dimensions: config.dimensions
    });
  }

  /**
   * 获取实际的向量维度（从数据库配置的模型）
   */
  private async getActualDimensions(): Promise<number> {
    // 如果缓存中有，直接返回
    if (this.dimensionsCache !== null) {
      return this.dimensionsCache;
    }

    try {
      // 延迟导入避免循环依赖
      if (!this.llmConfigService) {
        const { LLMConfigService } = await import('./LLMConfigService');
        this.llmConfigService = LLMConfigService.getInstance();
      }

      // 获取默认的embedding模型
      const embeddingModel = this.llmConfigService.getDefaultModel('embedding');

      if (embeddingModel) {
        // modelConfig 已经是解析好的对象
        const dimensions = embeddingModel.modelConfig?.dimensions || this.config.dimensions;

        logger.info(`Using actual embedding model dimensions: ${dimensions} (model: ${embeddingModel.modelName})`);

        // 缓存维度
        this.dimensionsCache = dimensions;
        return dimensions;
      }
    } catch (error) {
      logger.warn('Failed to get actual dimensions from database, using config default:', error);
    }

    // 回退到配置中的维度
    return this.config.dimensions;
  }

  /**
   * 更新配置维度（用于动态更新）
   */
  public async updateDimensions(dimensions: number): Promise<void> {
    if (this.dimensionsCache !== dimensions) {
      this.dimensionsCache = dimensions;
      this.config.dimensions = dimensions;

      logger.info(`Updated ToolRetrievalService dimensions to: ${dimensions}`);

      // 如果已经初始化，需要重新初始化表结构
      if (this.isInitialized && this.table) {
        logger.warn('Dimensions updated after initialization, consider reinitializing the service');
      }
    }
  }
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('ToolRetrievalService is already initialized');
      return;
    }

    const startTime = Date.now();

    try {
      logger.info('Initializing ToolRetrievalService...');

      // 获取实际的向量维度
      const actualDimensions = await this.getActualDimensions();
      if (actualDimensions !== this.config.dimensions) {
        logger.info(`Updating dimensions from ${this.config.dimensions} to ${actualDimensions}`);
        this.config.dimensions = actualDimensions;
      }

      // 1. 连接到LanceDB
      await this.connectToLanceDB();

      // 2. 创建或打开向量表
      await this.initializeSkillsTable();

      this.isInitialized = true;

      const duration = Date.now() - startTime;
      logger.debug(`ToolRetrievalService initialized in ${duration}ms`);

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
   * 检查表的向量维度是否匹配
   * 通过检查文件系统中的表结构来判断
   */
  private async checkTableDimensions(tableName: string): Promise<boolean> {
    try {
      logger.debug(`Checking table dimensions for: ${tableName}`);

      // 通过尝试添加一个记录来检查维度是否匹配
      // 如果维度不匹配，LanceDB会抛出错误
      const tempTable = await this.db!.openTable(tableName);

      try {
        // 创建一个测试向量
        const testVector = new Array(this.config.dimensions).fill(0.1);

        // 尝试添加一个临时记录（使用临时ID避免冲突）
        const tempId = `dimension-check-${Date.now()}`;
        await tempTable.add([{
          id: tempId,
          name: 'Dimension Check',
          description: 'Temporary record for dimension validation',
          tags: [],
          path: 'temp',
          version: '1.0',
          metadata: JSON.stringify({}), // 转换为JSON字符串以匹配schema
          vector: testVector,
          indexedAt: new Date()
        }]);

        // 如果成功，删除测试记录
        await tempTable.delete(`id = '${tempId}'`);

        logger.info(`Table dimensions match: ${this.config.dimensions}`);
        return true;
      } catch (insertError: any) {
        // 检查是否是维度不匹配的错误
        const errorMsg = insertError.message || '';
        if (errorMsg.includes('dimension') || errorMsg.includes('length') ||
            errorMsg.includes('schema') || errorMsg.includes('FixedSizeList')) {
          logger.info(`Table dimensions do not match config. Config: ${this.config.dimensions}`);
          logger.debug('Dimension mismatch error:', errorMsg);
          return false;
        }
        // 其他错误，重新抛出
        throw insertError;
      }
    } catch (error) {
      logger.error('Failed to check table dimensions:', error);
      return false;
    }
  }

  /**
   * 初始化Skills向量表
   */
  private async initializeSkillsTable(): Promise<void> {
    try {
      const tableName = 'skills';

      // 尝试直接打开表，如果失败则说明表不存在
      try {
        this.table = await this.db!.openTable(tableName);
        logger.info(`Table '${tableName}' exists, checking dimensions...`);

        // 表已存在，检查维度是否匹配
        const dimensionsMatch = await this.checkTableDimensions(tableName);
        logger.info(`Dimension check result: ${dimensionsMatch ? 'MATCH' : 'MISMATCH'}`);

        if (!dimensionsMatch) {
          // 维度不匹配，需要重新创建表
          logger.warn(`Table dimensions mismatch. Dropping and recreating table: ${tableName}`);

          // 完全删除旧表（包括物理文件）
          await this.dropTableCompletely(tableName);
          logger.info(`Dropped existing table: ${tableName}`);

          // 强制重新索引：删除所有 .vectorized 文件
          await this.forceReindexSkills();

          // 继续创建新表
        } else {
          // 维度匹配，使用现有表
          logger.info(`Using existing table: ${tableName}`);

          // 获取表中的记录数
          const count = await this.getTableCount();
          logger.info(`Table contains ${count} vector records`);

          // 检查是否需要添加新字段（MCP支持）
          await this.checkAndAddMissingFields(tableName);

          // 创建向量索引
          await this.createVectorIndex();
          return;
        }
      } catch (openError: any) {
        // 表不存在，继续创建新表
        logger.info(`Table '${tableName}' does not exist (${openError.message}), will create new table`);
      }

      // 创建新表 - 使用 Apache Arrow Schema（支持 Skills 和 MCP 工具）
      const schema = new arrow.Schema([
        new arrow.Field('id', new arrow.Utf8(), false),
        new arrow.Field('name', new arrow.Utf8(), false),
        new arrow.Field('description', new arrow.Utf8(), false),
        new arrow.Field('tags', new arrow.List(
          new arrow.Field('item', new arrow.Utf8(), true)
        ), false),
        new arrow.Field('path', new arrow.Utf8(), true), // 可选，Skill 才有
        new arrow.Field('version', new arrow.Utf8(), true), // 可选，Skill 才有
        new arrow.Field('source', new arrow.Utf8(), true), // MCP 服务器 ID 或 skill 名称
        new arrow.Field('toolType', new arrow.Utf8(), false), // 'skill' | 'mcp'
        new arrow.Field('metadata', new arrow.Utf8(), false), // 对象存储为JSON字符串
        new arrow.Field('vector', new arrow.FixedSizeList(
          this.config.dimensions,
          new arrow.Field('item', new arrow.Float32(), true)
        ), false),
        new arrow.Field('indexedAt', new arrow.Timestamp(arrow.TimeUnit.MICROSECOND), false)
      ]);

      // 创建空表
      this.table = await this.db!.createTable(tableName, [], { schema });

      logger.info(`Created new table: ${tableName} with ${this.config.dimensions} dimensions`);

      // 创建向量索引
      await this.createVectorIndex();

      // 索引所有 Skills（新表或重新创建的表需要重新索引）
      logger.info('Indexing all skills...');
      await this.scanAndIndexAllSkills();
      logger.info('Skills indexing completed');

    } catch (error) {
      logger.error('Failed to initialize Skills table:', error);
      throw error;
    }
  }

  /**
   * 检查并添加缺失的字段（为MCP支持）
   */
  private async checkAndAddMissingFields(tableName: string): Promise<void> {
    try {
      // 尝试插入一个包含所有字段的测试记录
      const testVector = new Array(this.config.dimensions).fill(0.0);

      const testRecord = {
        id: `field-check-${Date.now()}`,
        name: 'Field Check',
        description: 'Checking for missing fields',
        tags: [],
        path: null,
        version: null,
        source: null, // MCP 字段
        toolType: 'mcp', // MCP 字段
        metadata: '{}',
        vector: testVector,
        indexedAt: new Date()
      };

      await this.table!.add([testRecord]);
      logger.info('All fields (including MCP fields) are present');

      // 删除测试记录
      await this.table!.delete(`id == "${testRecord.id}"`);

    } catch (error: any) {
      // 检查是否是字段缺失错误
      if (error.message && error.message.includes('Found field not in schema')) {
        logger.warn('Table is missing MCP-related fields. Recreating table...');

        // 删除旧表并重新创建
        await this.db!.dropTable(tableName);
        logger.info(`Dropped existing table for recreation: ${tableName}`);

        // 重新创建表
        const schema = new arrow.Schema([
          new arrow.Field('id', new arrow.Utf8(), false),
          new arrow.Field('name', new arrow.Utf8(), false),
          new arrow.Field('description', new arrow.Utf8(), false),
          new arrow.Field('tags', new arrow.List(
            new arrow.Field('item', new arrow.Utf8(), true)
          ), false),
          new arrow.Field('path', new arrow.Utf8(), true),
          new arrow.Field('version', new arrow.Utf8(), true),
          new arrow.Field('source', new arrow.Utf8(), true), // MCP 服务器 ID 或 skill 名称
          new arrow.Field('toolType', new arrow.Utf8(), false), // 'skill' | 'mcp'
          new arrow.Field('metadata', new arrow.Utf8(), false),
          new arrow.Field('vector', new arrow.FixedSizeList(
            this.config.dimensions,
            new arrow.Field('item', new arrow.Float32(), true)
          ), false),
          new arrow.Field('indexedAt', new arrow.Timestamp(arrow.TimeUnit.MICROSECOND), false)
        ]);

        this.table = await this.db!.createTable(tableName, [], { schema });
        logger.info(`Recreated table: ${tableName} with MCP support`);

        // 重新创建索引
        await this.createVectorIndex();
      } else {
        // 其他错误，重新抛出
        throw error;
      }
    }
  }

  /**
   * 完全删除表和物理文件
   * 确保残留的 .lance 文件不会导致后续查询错误
   */
  private async dropTableCompletely(tableName: string): Promise<void> {
    try {
      // 首先从 LanceDB 删除表
      await this.db!.dropTable(tableName);
      logger.info(`Dropped table from LanceDB: ${tableName}`);

      // 然后手动删除物理文件确保完全清理
      const tablePath = path.join(this.config.vectorDbPath, tableName);
      try {
        await fs.rm(tablePath, { recursive: true, force: true });
        logger.info(`Completely removed physical files: ${tablePath}`);
      } catch (rmError: any) {
        if (rmError.code !== 'ENOENT') {
          logger.warn(`Failed to remove physical files (may not exist): ${rmError.message}`);
        }
      }
    } catch (error) {
      logger.error('Failed to drop table completely:', error);
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

      // 优先使用远程 embedding API（数据库配置的模型）
      return await this.generateRemoteEmbedding(skill);

    } catch (error) {
      logger.error(`Failed to generate embedding for ${skill.name}:`, error);
      throw new ToolError(
        `Embedding generation failed: ${this.formatError(error)}`,
        ToolErrorCode.EMBEDDING_MODEL_ERROR
      );
    }
  }

  /**
   * 使用远程API生成嵌入（通过 LLMManager 调用数据库配置的 embedding 模型）
   */
  private async generateRemoteEmbedding(skill: {
    name: string;
    description: string;
    tags: string[];
  }): Promise<number[]> {
    try {
      // 延迟导入 LLMManager，避免循环依赖
      if (!llmManagerInstance) {
        const { LLMManager } = await import('../core/LLMManager');
        llmManagerInstance = new LLMManager();
      }

      // 准备文本（名称 + 描述 + 标签）
      const text = this.prepareEmbeddingText(skill);

      // 调用 LLMManager.embed() - 会自动使用数据库配置的默认 embedding 模型
      const embeddings = await llmManagerInstance.embed([text]);

      if (!embeddings || embeddings.length === 0 || !embeddings[0]) {
        throw new Error('Empty embedding result');
      }

      logger.debug(`Generated remote embedding: ${embeddings[0].length} dimensions`);

      return embeddings[0];
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
   * 索引Skills（插入向量到数据库）
   */
  async indexSkill(skill: {
    name: string;
    description: string;
    tags: string[];
    path: string;
    version?: string;
    metadata?: Record<string, any>;
    tools?: any[];  // 新增 tools 参数
  }): Promise<void> {
    try {
      logger.info(`Indexing skill: ${skill.name}`);

      // 生成唯一ID
      const skillId = this.generateSkillId(skill.name);

      // 生成向量嵌入
      const vector = await this.getEmbedding(skill);

      // 准备记录数据 - 向量保持为普通数组格式（LanceDB要求）
      // 将 tools 转换为 parameters 格式以兼容现有代码
      const tools = skill.tools || [];
      const parameters = tools.length > 0 ? {
        type: 'object',
        properties: tools.reduce((acc: any, tool: any) => {
          // 将每个工具作为参数
          acc[tool.name] = {
            type: 'object',
            description: tool.description || '',
            properties: tool.input_schema?.properties || {},
            required: tool.input_schema?.required || []
          };
          return acc;
        }, {}),
        required: tools.filter((t: any) => t.input_schema?.required?.length > 0).map((t: any) => t.name)
      } : { type: 'object', properties: {}, required: [] };

      const record: ToolsTable = {
        id: skillId,
        name: skill.name,
        description: skill.description,
        tags: skill.tags || [],
        path: skill.path,
        version: skill.version || '1.0.0',
        source: skill.name,
        toolType: 'skill',
        metadata: JSON.stringify({
          ...skill.metadata,
          tools: skill.tools || [],
          parameters: parameters  // 存储 parameters 信息
        }), // 转换为JSON字符串以匹配schema
        vector: vector, // 保持为普通数组，不要转换为 Float32Array
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
    threshold: number = 0.40  // 从0.20提升至0.40，过滤噪声，优化语义搜索
  ): Promise<ToolRetrievalResult[]> {
    try {
      logger.info(`Searching relevant skills for query: "${query}"`);

      // 确保服务已初始化
      if (!this.isInitialized) {
        logger.warn('ToolRetrievalService not initialized, initializing now...');
        await this.initialize();
      }

      // 检查表是否存在
      if (!this.table) {
        throw new ToolError(
          'Vector table is not initialized. Please call initialize() first.',
          ToolErrorCode.VECTOR_DB_ERROR
        );
      }

      // 生成查询向量
      const queryVector = await this.getEmbedding({
        name: query,
        description: query,
        tags: []
      });

      // 执行向量搜索
      // 使用余弦相似度进行搜索
      const vectorQuery = this.table.query()
        .nearestTo(queryVector)  // 使用nearestTo进行向量搜索
        .distanceType('cosine')  // 设置距离类型为余弦相似度
        .limit(limit * 2); // 获取多一些结果以应用阈值过滤

      const results = await vectorQuery.toArray();

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
        // LanceDB 返回的是 _distance (余弦距离)，需要转换为相似度
        // 余弦相似度 = 1 - distance
        let score: number;
        if (result._distance !== undefined) {
          // LanceDB 返回的是距离（余弦距离），转换为相似度
          // 余弦距离范围 [0, 2]，所以相似度 = 1 - distance/2 或 1 - distance
          // 根据LanceDB文档，余弦相似度搜索时distance已经是余弦距离
          score = Math.max(0, 1 - result._distance);
        } else if (result.score !== undefined) {
          score = result.score;
        } else if (result.similarity !== undefined) {
          score = result.similarity;
        } else {
          score = 0;
        }

        // 应用阈值过滤
        if (score < threshold) {
          logger.debug(`Filtered out result with score ${score.toFixed(4)} < threshold ${threshold}`);
          continue;
        }

        // 获取数据
        const data: ToolsTable = result.item || result;

        // 解析metadata JSON字符串
        let metadata = {};
        try {
          if (typeof data.metadata === 'string') {
            metadata = JSON.parse(data.metadata);
          } else {
            metadata = data.metadata || {};
          }
        } catch (e) {
          logger.warn('Failed to parse metadata JSON:', e);
          metadata = {};
        }

        // 根据工具类型返回不同格式
        let tool: any;

        if (data.toolType === 'mcp') {
          // MCP 工具格式
          tool = {
            name: data.name,
            description: data.description,
            type: 'mcp' as const,
            source: data.source,
            tags: data.tags,
            metadata: {
              ...metadata,
              version: data.version,
              path: data.path
            }
          };
        } else if (data.toolType === 'builtin') {
          // Builtin 工具格式
          tool = {
            name: data.name,
            description: data.description,
            type: 'builtin' as const,
            tags: data.tags,
            version: data.version,
            path: data.path,
            metadata: {
              ...metadata,
              builtin: true
            }
          };
        } else {
          // Skill 工具格式（保持向后兼容）
          tool = {
            name: data.name,
            description: data.description,
            type: 'skill' as const,
            tags: data.tags,
            version: data.version,
            path: data.path,
            parameters: (metadata as any).parameters || { type: 'object', properties: {}, required: [] },
            enabled: true,
            level: 1
          };
        }

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
  async scanAndIndexAllSkills(skillsDir: string = './.data/skills'): Promise<void> {
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
    tools?: any[];
  }> {
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    // 读取文件
    const content = await fs.readFile(skillMdPath, 'utf8');

    // 使用 gray-matter 解析 YAML Frontmatter
    const parsed = matter(content);

    if (!parsed.data.name || !parsed.data.description) {
      throw new Error('SKILL.md must contain name and description');
    }

    return {
      name: parsed.data.name,
      description: parsed.data.description,
      tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
      version: parsed.data.version || '1.0.0',
      tools: parsed.data.tools || []  // 提取 tools 字段
    };
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
   * 强制重新索引所有 Skills（删除所有 .vectorized 文件）
   */
  private async forceReindexSkills(): Promise<void> {
    try {
      const skillsDir = './.data/skills';

      // 获取所有Skills目录
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      const skillDirs = entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

      logger.info(`Force reindexing ${skillDirs.length} skills...`);

      // 删除每个技能的 .vectorized 文件
      for (const skillName of skillDirs) {
        const skillPath = path.join(skillsDir, skillName);
        const vectorizedFile = path.join(skillPath, '.vectorized');

        try {
          await fs.unlink(vectorizedFile);
          logger.debug(`Deleted .vectorized file for skill: ${skillName}`);
        } catch (error: any) {
          // 文件不存在，忽略
          if (error.code !== 'ENOENT') {
            logger.warn(`Failed to delete .vectorized file for ${skillName}:`, error);
          }
        }
      }

      logger.info('Force reindex preparation completed');
    } catch (error) {
      logger.warn('Failed to force reindex skills:', error);
    }
  }

  /**
   * 获取服务统计信息
   */
  getStatistics() {
    return {
      initialized: this.isInitialized,
      config: this.config,
      embeddingModel: 'using-llm-manager'  // 通过 LLMManager 动态获取
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
   * 索引多个工具（支持 Skills 和 MCP 工具）
   * @param tools 工具数组
   */
  async indexTools(tools: any[]): Promise<void> {
    try {
      logger.info(`[ToolRetrieval] Indexing ${tools.length} tools...`);

      const records: ToolsTable[] = [];

      for (const tool of tools) {
        try {
          // 生成唯一ID
          const toolId = this.generateToolId(tool);

          // 获取工具的向量嵌入
          const vector = await this.getEmbeddingForTool(tool);

          // 准备记录数据
          const record: ToolsTable = {
            id: toolId,
            name: tool.name,
            description: tool.description,
            tags: tool.tags || [],
            path: tool.path, // Skill 可能有，MCP 工具没有
            version: tool.version, // Skill 可能有，MCP 工具没有
            source: tool.source || tool.name, // MCP 服务器 ID 或 skill 名称
            toolType: tool.type || 'skill', // 默认为 skill
            metadata: JSON.stringify(tool.metadata || {}),
            vector: vector,
            indexedAt: new Date()
          };

          records.push(record);
        } catch (error) {
          logger.error(`[ToolRetrieval] Failed to index tool ${tool.name}:`, error);
          // 继续索引其他工具
        }
      }

      if (records.length > 0) {
        // 删除已存在的记录
        for (const record of records) {
          await this.removeTool(record.id);
        }

        // 批量插入
        await this.table!.add(records as unknown as Record<string, unknown>[]);

        logger.info(`[ToolRetrieval] Successfully indexed ${records.length} tools`);
      } else {
        logger.warn('[ToolRetrieval] No tools were indexed');
      }
    } catch (error) {
      logger.error('[ToolRetrieval] Failed to index tools:', error);
      throw error;
    }
  }

  /**
   * 生成工具ID（支持 Skills 和 MCP 工具）
   */
  private generateToolId(tool: any): string {
    const source = tool.source || tool.name;
    return createHash('md5')
      .update(`${tool.type}:${source}:${tool.name}`)
      .digest('hex');
  }

  /**
   * 获取工具的向量嵌入（统一处理 Skills 和 MCP 工具）
   */
  private async getEmbeddingForTool(tool: any): Promise<number[]> {
    // 构造工具的文本描述
    const text = `${tool.name}\n${tool.description}\n${(tool.tags || []).join(' ')}`;

    // 使用现有的getEmbedding方法
    // 需要构造一个类似SkillTool的对象
    const mockSkill = {
      name: tool.name,
      description: tool.description,
      tags: tool.tags || [],
      metadata: tool.metadata || {}
    };

    return this.getEmbedding(mockSkill);
  }

  /**
   * 从向量表中删除工具
   */
  async removeTool(toolId: string): Promise<void> {
    try {
      await this.table!.delete(`id = "${toolId}"`);
      logger.debug(`[ToolRetrieval] Removed tool: ${toolId}`);
    } catch (error) {
      logger.error(`[ToolRetrieval] Failed to remove tool ${toolId}:`, error);
    }
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
      // 使用默认配置（维度会在初始化时动态获取）
      config = {
        vectorDbPath: './.data',
        model: 'nomic-embed-text:latest',
        cacheSize: 1000,
        dimensions: 768, // 初始值，会在初始化时被实际模型维度覆盖
        similarityThreshold: 0.40,  // 从0.20提升至0.40，过滤噪声，优化语义搜索
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