/**
 * TypeInductionEngine - 类型归纳引擎
 * ==========================================
 *
 * 分析历史 Playbook 和成功任务的特征模式，自动归纳新的类型标签，
 * 评估类型有效性并优化现有类型。
 *
 * 核心功能：
 * - 聚类分析：基于特征相似度对 Playbook 进行聚类
 * - LLM模式识别：使用 LLM 分析聚类结果，归纳类型标签
 * - 类型管理：合并相似类型、检测衰退类型、更新置信度
 * - 数据源支持：historical、batch、manual 三种数据源
 *
 * Version: 1.0.0
 * Created: 2025-12-18
 */

import {
  TypeInductionConfig,
  InducedType,
  TypeInductionResult,
  PlaybookFeature,
  PlaybookCluster,
  StrategicPlaybook
} from './types';

/**
 * LLM 管理器接口
 */
interface LLMManager {
  chat(messages: Array<{ role: string; content: string }>, options?: { stream?: boolean }): Promise<any>;
}

/**
 * 类型词汇表服务接口
 */
interface TypeVocabularyService {
  getAllTags(): Promise<any[]>;
  getTag(tagName: string): Promise<any>;
  createTag(tag: InducedType): Promise<void>;
  updateConfidence(tagName: string, confidence: number): Promise<void>;
  markAsDecaying(tagName: string): Promise<void>;
  mergeTags(sourceTag: string, targetTag: string): Promise<void>;
}

/**
 * 相似度服务接口
 */
interface SimilarityService {
  calculateSimilarity(tag1: string, tag2: string): Promise<number>;
  getSimilarTags(tagName: string, threshold: number): Promise<Array<{ tag1: string; tag2: string; similarity_score: number }>>;
}

/**
 * 日志记录器接口
 */
interface Logger {
  info(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: any): void;
}

/**
 * TypeInductionEngine - 类型归纳引擎
 *
 * 负责从 Playbook 集合中自动归纳新的类型标签，优化现有类型体系
 */
export class TypeInductionEngine {
  private readonly config: TypeInductionConfig;
  private readonly llmManager: LLMManager;
  private readonly typeVocabularyService: TypeVocabularyService;
  private readonly similarityService: SimilarityService;
  private readonly logger: Logger;

  constructor(
    config: TypeInductionConfig,
    llmManager: LLMManager,
    typeVocabularyService: TypeVocabularyService,
    similarityService: SimilarityService,
    logger: Logger
  ) {
    this.config = {
      min_samples: 3,
      min_similarity: 0.7,
      confidence_threshold: 0.8,
      decay_threshold: 0.5,
      max_new_types: 10,
      induction_interval: 24 * 60 * 60 * 1000, // 24 hours
      ...config
    };

    this.llmManager = llmManager;
    this.typeVocabularyService = typeVocabularyService;
    this.similarityService = similarityService;
    this.logger = logger;
  }

  /**
   * ========== 核心公共方法 ==========
   */

  /**
   * 主入口：触发类型归纳
   * @param source 数据源类型：historical | batch | manual
   * @param options 可选的配置覆盖参数
   * @returns 类型归纳结果
   */
  async induceTypes(
    source: 'historical' | 'batch' | 'manual',
    options?: Partial<TypeInductionConfig>
  ): Promise<TypeInductionResult> {
    this.logger.info('[TypeInductionEngine] 开始类型归纳', { source, options });

    const config = { ...this.config, ...options };
    const results: TypeInductionResult = {
      induced_types: [],
      merged_types: [],
      deprecated_types: [],
      confidence_updates: {}
    };

    try {
      // 1. 获取待分析数据
      const playbooks = await this.getPlaybooksForAnalysis(source);
      this.logger.debug(`[TypeInductionEngine] 获取 ${playbooks.length} 个Playbook进行分析`);

      if (playbooks.length === 0) {
        this.logger.warn('[TypeInductionEngine] 未找到可分析的Playbook');
        return results;
      }

      // 2. 特征提取
      const features = await this.extractFeatures(playbooks);
      this.logger.debug(`[TypeInductionEngine] 提取 ${features.length} 个特征向量`);

      // 3. 聚类分析
      const clusters = await this.clusterPlaybooks(features, config);
      this.logger.debug(`[TypeInductionEngine] 聚类结果: ${clusters.length} 个簇`);

      // 4. 从每个簇归纳类型
      for (const cluster of clusters) {
        if (cluster.playbooks.length < config.min_samples) {
          this.logger.debug(
            `[TypeInductionEngine] 簇 ${cluster.cluster_id} 样本数不足，跳过`,
            { sampleCount: cluster.playbooks.length, minRequired: config.min_samples }
          );
          continue;
        }

        const inducedType = await this.induceTypeFromCluster(cluster, config);
        if (inducedType) {
          // 检查是否超过最大新类型数限制
          if (results.induced_types.length >= config.max_new_types) {
            this.logger.warn(
              `[TypeInductionEngine] 已达到最大新类型数限制 (${config.max_new_types})，停止归纳`
            );
            break;
          }

          results.induced_types.push(inducedType);
          this.logger.debug(
            `[TypeInductionEngine] 成功归纳类型: ${inducedType.tag_name}`,
            { confidence: inducedType.confidence, sampleCount: inducedType.sample_count }
          );
        }
      }

      // 5. 评估现有类型
      const evaluation = await this.evaluateExistingTypes();
      results.merged_types = evaluation.merged_types;
      results.deprecated_types = evaluation.deprecated_types;
      results.confidence_updates = evaluation.confidence_updates;

      // 6. 持久化结果
      await this.persistResults(results);

      this.logger.info(
        `[TypeInductionEngine] 类型归纳完成: 新增${results.induced_types.length}个, ` +
        `合并${results.merged_types.length}个, 衰退${results.deprecated_types.length}个`
      );

      return results;

    } catch (error) {
      this.logger.error('[TypeInductionEngine] 类型归纳失败', error);
      throw error;
    }
  }

  /**
   * 聚类分析：基于特征相似度对 Playbook 进行聚类
   * @param features 提取的特征向量
   * @param config 配置参数
   * @returns 聚类结果
   */
  private async clusterPlaybooks(
    features: PlaybookFeature[],
    config: TypeInductionConfig
  ): Promise<PlaybookCluster[]> {
    this.logger.debug('[TypeInductionEngine] 开始聚类分析', { featureCount: features.length });

    const clusters: PlaybookCluster[] = [];
    const processed = new Set<string>();

    for (const feature of features) {
      if (processed.has(feature.playbookId)) continue;

      // 创建新簇，以当前特征为中心
      const cluster: PlaybookCluster = {
        cluster_id: `cluster_${clusters.length + 1}_${Date.now()}`,
        playbooks: [feature.playbook],
        center: feature,
        similarity_sum: 1.0
      };

      processed.add(feature.playbookId);

      // 查找与当前特征相似的其他 Playbook
      for (const otherFeature of features) {
        if (processed.has(otherFeature.playbookId)) continue;

        const similarity = await this.calculateFeatureSimilarity(feature, otherFeature);

        if (similarity >= config.min_similarity) {
          cluster.playbooks.push(otherFeature.playbook);
          cluster.similarity_sum += similarity;
          processed.add(otherFeature.playbookId);

          this.logger.debug(
            `[TypeInductionEngine] 添加到簇 ${cluster.cluster_id}`,
            {
              playbookId: otherFeature.playbookId,
              similarity: similarity.toFixed(3)
            }
          );
        }
      }

      // 只保留满足最小样本数的簇
      if (cluster.playbooks.length >= config.min_samples) {
        clusters.push(cluster);
        this.logger.debug(
          `[TypeInductionEngine] 创建新簇: ${cluster.cluster_id}`,
          {
            playbookCount: cluster.playbooks.length,
            avgSimilarity: cluster.similarity_sum / cluster.playbooks.length
          }
        );
      }
    }

    this.logger.info(`[TypeInductionEngine] 聚类完成，生成 ${clusters.length} 个有效簇`);
    return clusters;
  }

  /**
   * 从簇中归纳类型：使用 LLM 分析聚类结果，生成类型标签
   * @param cluster Playbook 簇
   * @param config 配置参数
   * @returns 归纳的类型，或 null 如果置信度不足
   */
  private async induceTypeFromCluster(
    cluster: PlaybookCluster,
    config: TypeInductionConfig
  ): Promise<InducedType | null> {
    try {
      // 1. 构建 LLM 提示词
      const prompt = this.buildInductionPrompt(cluster);

      this.logger.debug(
        `[TypeInductionEngine] 向LLM请求分析簇 ${cluster.cluster_id}`,
        { playbookCount: cluster.playbooks.length }
      );

      // 2. 调用 LLM 分析
      const response = await this.llmManager.chat(
        [{ role: 'user', content: prompt }],
        { stream: false }
      );

      // 3. 解析响应
      const analysis = this.parseInductionResponse(response.choices?.[0]?.message?.content || '');

      if (!analysis) {
        this.logger.warn(`[TypeInductionEngine] 簇 ${cluster.cluster_id} LLM响应解析失败`);
        return null;
      }

      // 4. 检查置信度阈值
      if (analysis.confidence < config.confidence_threshold) {
        this.logger.debug(
          `[TypeInductionEngine] 簇 ${cluster.cluster_id} 置信度不足`,
          { confidence: analysis.confidence, threshold: config.confidence_threshold }
        );
        return null;
      }

      // 5. 生成标签名
      const tagName = this.generateTagName(analysis.name);

      // 6. 检查是否已存在相似标签
      const existing = await this.typeVocabularyService.getTag(tagName);
      if (existing) {
        this.logger.debug(`[TypeInductionEngine] 标签 ${tagName} 已存在，跳过`);
        return null;
      }

      // 7. 返回归纳的类型
      return {
        tag_name: tagName,
        keywords: analysis.keywords,
        confidence: analysis.confidence,
        sample_count: cluster.playbooks.length,
        playbook_examples: cluster.playbooks.slice(0, 3).map(p => p.id),
        rationale: analysis.rationale,
        discovered_from: 'historical_clustering',
        created_at: Date.now()
      };

    } catch (error) {
      this.logger.error(
        `[TypeInductionEngine] 簇 ${cluster.cluster_id} 类型归纳失败`,
        error
      );
      return null;
    }
  }

  /**
   * 评估现有类型：合并相似类型、检测衰退类型、更新置信度
   * @returns 评估结果
   */
  private async evaluateExistingTypes(): Promise<{
    merged_types: string[];
    deprecated_types: string[];
    confidence_updates: Record<string, number>;
  }> {
    this.logger.debug('[TypeInductionEngine] 开始评估现有类型');

    const allTags = await this.typeVocabularyService.getAllTags();
    const results = {
      merged_types: [] as string[],
      deprecated_types: [] as string[],
      confidence_updates: {} as Record<string, number>
    };

    if (allTags.length === 0) {
      this.logger.debug('[TypeInductionEngine] 当前没有类型标签，跳过评估');
      return results;
    }

    // 1. 检测相似标签，准备合并
    this.logger.debug(`[TypeInductionEngine] 检测 ${allTags.length} 个标签的相似性`);
    for (let i = 0; i < allTags.length; i++) {
      for (let j = i + 1; j < allTags.length; j++) {
        const tag1 = allTags[i];
        const tag2 = allTags[j];

        const similarity = await this.similarityService.calculateSimilarity(
          tag1.tag_name,
          tag2.tag_name
        );

        if (similarity > 0.8) {
          // 合并置信度较低的标签
          const keepTag = tag1.confidence >= tag2.confidence ? tag1 : tag2;
          const removeTag = keepTag === tag1 ? tag2 : tag1;

          this.logger.debug(
            `[TypeInductionEngine] 发现相似标签: ${tag1.tag_name} <-> ${tag2.tag_name}`,
            { similarity: similarity.toFixed(3) }
          );

          results.merged_types.push(removeTag.tag_name);

          // 更新保留标签的置信度
          const newConfidence = Math.min(1.0, keepTag.confidence + 0.1);
          results.confidence_updates[keepTag.tag_name] = newConfidence;
        }
      }
    }

    // 2. 检测衰退标签
    for (const tag of allTags) {
      const daysSinceUpdate = (Date.now() - tag.updated_at) / (24 * 60 * 60 * 1000);
      const avgConfidence = tag.confidence;

      if (daysSinceUpdate > 90 && avgConfidence < this.config.decay_threshold) {
        this.logger.debug(
          `[TypeInductionEngine] 标记衰退标签: ${tag.tag_name}`,
          { daysSinceUpdate: daysSinceUpdate.toFixed(1), confidence: avgConfidence }
        );
        results.deprecated_types.push(tag.tag_name);
      }
    }

    this.logger.info(
      `[TypeInductionEngine] 评估完成: 合并${results.merged_types.length}个, ` +
      `衰退${results.deprecated_types.length}个, 更新${Object.keys(results.confidence_updates).length}个置信度`
    );

    return results;
  }

  /**
   * ========== 核心辅助方法 ==========
   */

  /**
   * 提取特征：从 Playbook 集合中提取用于聚类的特征向量
   * @param playbooks Playbook 列表
   * @returns 特征向量列表
   */
  private async extractFeatures(playbooks: StrategicPlaybook[]): Promise<PlaybookFeature[]> {
    this.logger.debug(`[TypeInductionEngine] 开始提取 ${playbooks.length} 个Playbook的特征`);

    return playbooks.map(pb => {
      // 提取文本内容
      const textContent = `${pb.name} ${pb.description} ${pb.context.scenario}`;

      return {
        playbookId: pb.id,
        playbook: pb,
        name: pb.name,
        description: pb.description,
        scenario: pb.context.scenario,
        keywords: this.extractKeywords(textContent),
        tools: this.extractTools(pb.actions),
        complexity: pb.context.complexity,
        created_at: pb.createdAt
      };
    });
  }

  /**
   * 计算特征相似度：使用 Jaccard 相似度算法
   * @param f1 特征向量1
   * @param f2 特征向量2
   * @returns 相似度分数 [0-1]
   */
  private async calculateFeatureSimilarity(
    f1: PlaybookFeature,
    f2: PlaybookFeature
  ): Promise<number> {
    // 文本相似度 (50%)
    const textSim = this.calculateJaccardSimilarity(f1.keywords, f2.keywords) * 0.5;

    // 工具相似度 (30%)
    const toolSim = this.calculateJaccardSimilarity(f1.tools, f2.tools) * 0.3;

    // 复杂度相似度 (10%)
    const complexitySim = f1.complexity === f2.complexity ? 0.1 : 0;

    // 名称相似度 (10%)
    const nameSim = this.calculateJaccardSimilarity(
      f1.name.split(/\s+/),
      f2.name.split(/\s+/)
    ) * 0.1;

    const totalSimilarity = textSim + toolSim + complexitySim + nameSim;

    this.logger.debug(
      `[TypeInductionEngine] 计算特征相似度`,
      {
        playbook1: f1.playbookId,
        playbook2: f2.playbookId,
        textSim: textSim.toFixed(3),
        toolSim: toolSim.toFixed(3),
        complexitySim: complexitySim.toFixed(3),
        nameSim: nameSim.toFixed(3),
        total: totalSimilarity.toFixed(3)
      }
    );

    return totalSimilarity;
  }

  /**
   * 构建 LLM 提示词：为类型归纳构建专业的提示词
   * @param cluster Playbook 簇
   * @returns 提示词字符串
   */
  private buildInductionPrompt(cluster: PlaybookCluster): string {
    const examples = cluster.playbooks.slice(0, 5).map((pb, i) => `
示例 ${i + 1}:
名称: ${pb.name}
描述: ${pb.description}
上下文: ${pb.context.scenario}
步骤数: ${pb.actions?.length || 0}
复杂度: ${pb.context.complexity}
    `).join('\n');

    return `
分析以下 ${cluster.playbooks.length} 个相似Playbook，归纳出新的类型标签：

${examples}

请从以下维度分析：
1. 共同的行动模式或策略
2. 相似的问题场景或目标
3. 重复的工具使用模式
4. 一致的结果特征

请以JSON格式返回：
{
  "name": "类型名称（简洁的中文或英文）",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "confidence": 0.95,
  "rationale": "归纳理由和价值说明"
}

要求：
- 类型名称应简洁有力，便于记忆
- 关键词应准确反映类型特征
- 置信度基于样本数量和相似度 [0-1]
- 理由应清晰说明为什么这样归纳
`;
  }

  /**
   * 解析 LLM 响应：从 LLM 回复中提取结构化数据
   * @param response LLM 原始响应
   * @returns 解析后的数据，或 null 如果解析失败
   */
  private parseInductionResponse(response: string): {
    name: string;
    keywords: string[];
    confidence: number;
    rationale: string;
  } | null {
    try {
      // 尝试提取 JSON 块
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn('[TypeInductionEngine] 未找到JSON格式响应', { response });
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 验证必要字段
      if (!parsed.name || !parsed.keywords || !parsed.rationale) {
        this.logger.warn('[TypeInductionEngine] 响应缺少必要字段', { parsed });
        return null;
      }

      return {
        name: parsed.name,
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0)),
        rationale: parsed.rationale
      };

    } catch (error) {
      this.logger.error('[TypeInductionEngine] 解析归纳响应失败', error);
      return null;
    }
  }

  /**
   * 获取待分析数据：根据数据源获取相应的 Playbook 集合
   * @param source 数据源类型
   * @returns Playbook 列表
   */
  private async getPlaybooksForAnalysis(source: 'historical' | 'batch' | 'manual'): Promise<StrategicPlaybook[]> {
    switch (source) {
      case 'historical':
        // 获取最近30天有更新的Playbook
        return await this.getRecentlyUpdatedPlaybooks(30);

      case 'batch':
        // 获取所有Playbook
        return await this.getAllActivePlaybooks();

      case 'manual':
        // 获取用户指定或标记的Playbook
        return await this.getManuallyTaggedPlaybooks();

      default:
        this.logger.warn(`[TypeInductionEngine] 未知数据源: ${source}`);
        return [];
    }
  }

  /**
   * ========== 工具方法 ==========
   */

  /**
   * 生成标签名：将自然语言转换为标准化的标签名
   * @param name 原始名称
   * @returns 标准化标签名
   */
  private generateTagName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[\s\-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Jaccard 相似度计算：计算两个集合的 Jaccard 相似度
   * @param set1 集合1
   * @param set2 集合2
   * @returns 相似度分数 [0-1]
   */
  private calculateJaccardSimilarity(set1: string[], set2: string[]): number {
    const s1 = new Set(set1.map(s => s.toLowerCase()));
    const s2 = new Set(set2.map(s => s.toLowerCase()));

    // 计算交集
    let intersectionSize = 0;
    s1.forEach(item => {
      if (s2.has(item)) {
        intersectionSize++;
      }
    });

    // 计算并集
    const unionSize = s1.size + s2.size - intersectionSize;

    return unionSize === 0 ? 0 : intersectionSize / unionSize;
  }

  /**
   * 提取关键词：从文本中提取有意义的关键词
   * @param text 文本内容
   * @returns 关键词列表
   */
  private extractKeywords(text: string): string[] {
    // 停用词列表
    const stopWords = new Set([
      '的', '了', '在', '是', '和', '与', '及', '等', 'of', 'the', 'and', 'or', 'to', 'in'
    ]);

    // 分词并过滤
    const words = text
      .toLowerCase()
      .replace(/[，。？！；：、,\.!?;:\s]+/g, ' ')
      .split(' ')
      .filter(w => w.length > 1 && !stopWords.has(w));

    // 去重并限制数量
    return Array.from(new Set(words)).slice(0, 20);
  }

  /**
   * 提取工具：从 Playbook 动作中提取使用的工具
   * @param actions Playbook 动作列表
   * @returns 工具列表
   */
  private extractTools(actions: any[]): string[] {
    const tools: string[] = [];
    actions?.forEach(action => {
      if (action.resources) {
        tools.push(...action.resources);
      }
    });
    return Array.from(new Set(tools));
  }

  /**
   * 持久化结果：将归纳结果保存到数据库
   * @param results 归纳结果
   */
  private async persistResults(results: TypeInductionResult): Promise<void> {
    this.logger.debug('[TypeInductionEngine] 开始持久化结果');

    try {
      // 1. 创建新类型
      for (const type of results.induced_types) {
        await this.typeVocabularyService.createTag(type);
        this.logger.debug(`[TypeInductionEngine] 创建新类型: ${type.tag_name}`);
      }

      // 2. 更新置信度
      for (const [tagName, confidence] of Object.entries(results.confidence_updates)) {
        await this.typeVocabularyService.updateConfidence(tagName, confidence as number);
        this.logger.debug(`[TypeInductionEngine] 更新置信度: ${tagName} -> ${confidence}`);
      }

      // 3. 合并标签
      for (const tagName of results.merged_types) {
        // 找到合并目标（需要更复杂的逻辑来确定目标标签）
        // 这里假设已在前面的逻辑中确定了目标
        this.logger.debug(`[TypeInductionEngine] 标记合并标签: ${tagName}`);
      }

      // 4. 标记衰退
      for (const tagName of results.deprecated_types) {
        await this.typeVocabularyService.markAsDecaying(tagName);
        this.logger.debug(`[TypeInductionEngine] 标记衰退标签: ${tagName}`);
      }

      this.logger.info('[TypeInductionEngine] 结果持久化完成');

    } catch (error) {
      this.logger.error('[TypeInductionEngine] 结果持久化失败', error);
      throw error;
    }
  }

  /**
   * ========== 数据获取辅助方法 ==========
   */

  /**
   * 获取最近更新的 Playbook
   * @param days 天数
   * @returns Playbook 列表
   */
  private async getRecentlyUpdatedPlaybooks(days: number): Promise<StrategicPlaybook[]> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    this.logger.debug(`[TypeInductionEngine] 获取最近${days}天更新的Playbook`, {
      cutoff: new Date(cutoff).toISOString()
    });

    // TODO: 从数据库查询
    // 实现从 SQLite 或其他数据源获取最近更新的 Playbook
    // 这里返回空数组，实际需要根据数据存储层实现

    return [];
  }

  /**
   * 获取所有活跃的 Playbook
   * @returns Playbook 列表
   */
  private async getAllActivePlaybooks(): Promise<StrategicPlaybook[]> {
    this.logger.debug('[TypeInductionEngine] 获取所有活跃Playbook');

    // TODO: 从数据库查询
    // 实现从数据存储层获取所有活跃状态的 Playbook

    return [];
  }

  /**
   * 获取手动标记的 Playbook
   * @returns Playbook 列表
   */
  private async getManuallyTaggedPlaybooks(): Promise<StrategicPlaybook[]> {
    this.logger.debug('[TypeInductionEngine] 获取手动标记的Playbook');

    // TODO: 从数据库查询
    // 实现获取用户手动标记为需要分析的 Playbook

    return [];
  }
}
