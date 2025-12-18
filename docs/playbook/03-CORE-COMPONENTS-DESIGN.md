# Playbook 系统架构改造 - 核心组件设计文档

## 文档信息
- **文档版本**: v1.0.0
- **创建日期**: 2025-12-18
- **作者**: 系统架构团队
- **状态**: 待评审

## 1. 组件概览

### 1.1 新增核心组件
```
┌─────────────────────────────────────────────────────────┐
│  TypeInductionEngine                                     │
│  - 类型归纳引擎                                          │
│  - 聚类分析                                              │
│  - LLM模式识别                                          │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  PlaybookTemplateManager                                │
│  - 提示词模板管理                                        │
│  - 变量替换                                              │
│  - 效果评估                                              │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  PlaybookInjector                                       │
│  - 提示词注入器 (替代Executor)                          │
│  - 强度控制                                              │
│  - 失败回退                                              │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  Enhanced PlaybookMatcher                               │
│  - 多标签匹配                                            │
│  - 置信度计算                                            │
│  - 相似度检索                                            │
└─────────────────────────────────────────────────────────┘
```

### 1.2 现有增强组件
```
┌─────────────────────────────────────────────────────────┐
│  SystemPromptService (增强)                             │
│  - 支持Playbook模板片段                                  │
│  - 模板变量注入                                          │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  VariableEngine (增强)                                  │
│  - Playbook变量解析器                                    │
│  - 缓存优化                                              │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  ReActStrategy (改造)                                   │
│  - prepare()阶段集成Playbook匹配                         │
│  - 思考链融合                                            │
│  - 智能注入决策                                          │
└─────────────────────────────────────────────────────────┘
```

## 2. TypeInductionEngine - 类型归纳引擎

### 2.1 职责概述
分析历史 Playbook 和成功任务的特征模式，自动归纳新的类型标签，评估类型有效性并优化现有类型。

### 2.2 类设计

```typescript
interface TypeInductionConfig {
  min_samples: number;              // 最少样本数 (默认: 3)
  min_similarity: number;           // 最小相似度 (默认: 0.7)
  confidence_threshold: number;     // 置信度阈值 (默认: 0.8)
  decay_threshold: number;          // 衰退阈值 (默认: 0.5)
  max_new_types: number;            // 每次最大新类型数 (默认: 10)
  induction_interval: number;       // 归纳间隔 (默认: 24h)
}

interface InducedType {
  tag_name: string;
  keywords: string[];
  confidence: number;
  sample_count: number;
  playbook_examples: string[];
  rationale: string;
  discovered_from: 'historical_clustering' | 'llm_analysis' | 'manual';
  created_at: number;
}

class TypeInductionEngine {
  private config: TypeInductionConfig;
  private llmManager: LLMManager;
  private typeVocabularyService: TypeVocabularyService;
  private similarityService: SimilarityService;
  private logger: Logger;

  constructor(
    config: TypeInductionConfig,
    llmManager: LLMManager,
    typeVocabularyService: TypeVocabularyService,
    similarityService: SimilarityService
  ) {
    this.config = config;
    this.llmManager = llmManager;
    this.typeVocabularyService = typeVocabularyService;
    this.similarityService = similarityService;
  }

  /**
   * 主入口：触发类型归纳
   */
  async induceTypes(
    source: 'historical' | 'batch' | 'manual',
    options?: Partial<TypeInductionConfig>
  ): Promise<{
    induced_types: InducedType[];
    merged_types: string[];
    deprecated_types: string[];
    confidence_updates: Record<string, number>;
  }> {
    this.logger.info('[TypeInductionEngine] 开始类型归纳', { source });

    const config = { ...this.config, ...options };
    const results = {
      induced_types: [],
      merged_types: [],
      deprecated_types: [],
      confidence_updates: {}
    };

    try {
      // 1. 获取待分析数据
      const playbooks = await this.getPlaybooksForAnalysis(source);
      this.logger.debug(`[TypeInductionEngine] 获取 ${playbooks.length} 个Playbook进行分析`);

      // 2. 特征提取
      const features = await this.extractFeatures(playbooks);

      // 3. 聚类分析
      const clusters = await this.clusterPlaybooks(features, config);
      this.logger.debug(`[TypeInductionEngine] 聚类结果: ${clusters.length} 个簇`);

      // 4. 从每个簇归纳类型
      for (const cluster of clusters) {
        if (cluster.playbooks.length < config.min_samples) {
          continue;
        }

        const inducedType = await this.induceTypeFromCluster(cluster, config);
        if (inducedType) {
          results.induced_types.push(inducedType);
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
        `[TypeInductionEngine] 类型归纳完成: 新增${results.induced_types.length}个, 合并${results      );

      return results;

    }}个`
 catch (error).merged_types.length {
      this.logger.error('[TypeInductionEngine] 类型归纳失败', error);
      throw error;
    }
  }

  /**
   * 从簇中归纳类型
   */
  private async induceTypeFromCluster(
    cluster: PlaybookCluster,
    config: TypeInductionConfig
  ): Promise<InducedType | null> {
    // 1. 构建提示词
    const prompt = this.buildInductionPrompt(cluster);

    // 2. 调用 LLM 分析
    const response = await this.llmManager.chat([
      { role: 'user', content: prompt }
    ], { stream: false });

    // 3. 解析响应
    const analysis = this.parseInductionResponse(response.choices[0]?.message?.content || '');

    if (!analysis || analysis.confidence < config.confidence_threshold) {
      return null;
    }

    // 4. 生成标签名
    const tagName = this.generateTagName(analysis.name);

    // 5. 检查是否已存在
    const existing = await this.typeVocabularyService.getTag(tagName);
    if (existing) {
      this.logger.debug(`[TypeInductionEngine] 标签 ${tagName} 已存在，跳过`);
      return null;
    }

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
  }

  /**
   * 聚类分析
   */
  private async clusterPlaybooks(
    features: PlaybookFeature[],
    config: TypeInductionConfig
  ): Promise<PlaybookCluster[]> {
    // 使用改进的聚类算法
    const clusters: PlaybookCluster[] = [];
    const processed = new Set<string>();

    for (const feature of features) {
      if (processed.has(feature.playbookId)) continue;

      const cluster: PlaybookCluster = {
        cluster_id: `cluster_${clusters.length + 1}`,
        playbooks: [feature.playbook],
        center: feature,
        similarity_sum: 1.0
      };

      processed.add(feature.playbookId);

      // 查找相似 Playbook
      for (const otherFeature of features) {
        if (processed.has(otherFeature.playbookId)) continue;

        const similarity = await this.calculateFeatureSimilarity(feature, otherFeature);

        if (similarity >= config.min_similarity) {
          cluster.playbooks.push(otherFeature.playbook);
          cluster.similarity_sum += similarity;
          processed.add(otherFeature.playbookId);
        }
      }

      if (cluster.playbooks.length >= config.min_samples) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * 评估现有类型
   */
  private async evaluateExistingTypes(): Promise<{
    merged_types: string[];
    deprecated_types: string[];
    confidence_updates: Record<string, number>;
  }> {
    const allTags = await this.typeVocabularyService.getAllTags();
    const results = {
      merged_types: [],
      deprecated_types: [],
      confidence_updates: {}
    };

    // 1. 检测相似标签，准备合并
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
        results.deprecated_types.push(tag.tag_name);
      }
    }

    return results;
  }

  // ========== 私有辅助方法 ==========

  private buildInductionPrompt(cluster: PlaybookCluster): string {
    const examples = cluster.playbooks.slice(0, 5).map((pb, i) => `
示例 ${i + 1}:
名称: ${pb.name}
描述: ${pb.description}
上下文: ${pb.context.scenario}
步骤数: ${pb.actions.length}
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

  private parseInductionResponse(response: string): {
    name: string;
    keywords: string[];
    confidence: number;
    rationale: string;
  } | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      return {
        name: parsed.name,
        keywords: parsed.keywords || [],
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0)),
        rationale: parsed.rationale || ''
      };
    } catch (error) {
      this.logger.error('[TypeInductionEngine] 解析归纳响应失败', error);
      return null;
    }
  }

  private generateTagName(name: string): string {
    // 转换为英文小写，用下划线分隔
    return name
      .toLowerCase()
      .replace(/[\s\-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private async getPlaybooksForAnalysis(source: string): Promise<StrategicPlaybook[]> {
    // 根据来源获取不同的Playbook集合
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
        return [];
    }
  }

  private async extractFeatures(playbooks: StrategicPlaybook[]): Promise<PlaybookFeature[]> {
    return playbooks.map(pb => ({
      playbookId: pb.id,
      playbook: pb,
      name: pb.name,
      description: pb.description,
      scenario: pb.context.scenario,
      keywords: this.extractKeywords(`${pb.name} ${pb.description} ${pb.context.scenario}`),
      tools: this.extractTools(pb.actions),
      complexity: pb.context.complexity,
      created_at: pb.createdAt
    }));
  }

  private extractKeywords(text: string): string[] {
    // 复用 PlaybookManager 中的逻辑
    const stopWords = new Set(['的', '了', '在', '是', '和', '与', '及', '等']);
    const words = text
      .toLowerCase()
      .replace(/[，。？！；：、,\.!?;:\s]+/g, ' ')
      .split(' ')
      .filter(w => w.length > 1 && !stopWords.has(w));

    return Array.from(new Set(words)).slice(0, 20);
  }

  private extractTools(actions: PlaybookAction[]): string[] {
    const tools: string[] = [];
    actions.forEach(action => {
      if (action.resources) {
        tools.push(...action.resources);
      }
    });
    return Array.from(new Set(tools));
  }

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

    return textSim + toolSim + complexitySim + nameSim;
  }

  private calculateJaccardSimilarity(set1: string[], set2: string[]): number {
    const s1 = new Set(set1);
    const s2 = new Set(set2);

    const intersection = new Set([...s1].filter(x => s2.has(x)));
    const union = new Set([...s1, ...s2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  private async persistResults(results: any): Promise<void> {
    // 持久化新类型
    for (const type of results.induced_types) {
      await this.typeVocabularyService.createTag(type);
    }

    // 更新置信度
    for (const [tagName, confidence] of Object.entries(results.confidence_updates)) {
      await this.typeVocabularyService.updateConfidence(tagName, confidence as number);
    }

    // 合并标签
    for (const tagName of results.merged_types) {
      // 实际合并逻辑...
    }

    // 标记衰退
    for (const tagName of results.deprecated_types) {
      await this.typeVocabularyService.markAsDecaying(tagName);
    }
  }

  // ========== 数据获取辅助方法 ==========

  private async getRecentlyUpdatedPlaybooks(days: number): Promise<StrategicPlaybook[]> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    // TODO: 从数据库查询
    return [];
  }

  private async getAllActivePlaybooks(): Promise<StrategicPlaybook[]> {
    // TODO: 从数据库查询
    return [];
  }

  private async getManuallyTaggedPlaybooks(): Promise<StrategicPlaybook[]> {
    // TODO: 获取用户标记的Playbook
    return [];
  }
}

// ========== 辅助类型 ==========

interface PlaybookFeature {
  playbookId: string;
  playbook: StrategicPlaybook;
  name: string;
  description: string;
  scenario: string;
  keywords: string[];
  tools: string[];
  complexity: string;
  created_at: number;
}

interface PlaybookCluster {
  cluster_id: string;
  playbooks: StrategicPlaybook[];
  center: PlaybookFeature;
  similarity_sum: number;
}
```

### 2.3 使用示例

```typescript
// 触发类型归纳
const engine = new TypeInductionEngine(config, llmManager, typeVocabularyService, similarityService);

const results = await engine.induceTypes('historical', {
  min_samples: 5,
  min_similarity: 0.75
});

console.log(`诱导出 ${results.induced_types.length} 个新类型`);
console.log(`合并了 ${results.merged_types.length} 个相似类型`);
```

## 3. PlaybookTemplateManager - 提示词模板管理器

### 3.1 职责概述
管理提示词模板，支持动态变量替换，提供多模板效果评估和智能选择。

### 3.2 类设计

```typescript
interface TemplateRenderOptions {
  variables: Record<string, any>;
  guidance_level?: 'light' | 'medium' | 'intensive';
  language?: 'zh' | 'en';
  tone?: 'professional' | 'friendly' | 'concise';
  max_length?: number;
}

interface TemplateEffectiveness {
  template_id: string;
  usage_count: number;
  avg_satisfaction: number;
  success_rate: number;
  avg_response_time: number;
  last_evaluated: number;
}

class PlaybookTemplateManager {
  private promptTemplateService: PromptTemplateService;
  private variableEngine: VariableEngine;
  private llmManager: LLMManager;
  private effectivenessTracker: TemplateEffectivenessTracker;
  private logger: Logger;

  constructor(
    promptTemplateService: PromptTemplateService,
    variableEngine: VariableEngine,
    llmManager: LLMManager
  ) {
    this.promptTemplateService = promptTemplateService;
    this.variableEngine = variableEngine;
    this.llmManager = llmManager;
  }

  /**
   * 渲染提示词模板
   */
  async renderTemplate(
    templateId: string,
    playbook: StrategicPlaybook,
    options: TemplateRenderOptions
  ): Promise<{
    content: string;
    variables_used: string[];
    token_count: number;
  }> {
    const template = await this.promptTemplateService.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // 1. 提取变量值
    const variables = await this.extractVariables(playbook, options.variables);

    // 2. 变量替换
    let content = this.applyVariables(template.content, variables);

    // 3. 格式调整
    content = this.adjustFormatting(content, options);

    // 4. 长度控制
    if (options.max_length) {
      content = this.truncateContent(content, options.max_length);
    }

    // 5. 更新使用统计
    await this.promptTemplateService.incrementUsage(templateId);

    return {
      content,
      variables_used: Object.keys(variables),
      token_count: this.estimateTokenCount(content)
    };
  }

  /**
   * 智能选择模板
   */
  async selectBestTemplate(
    playbook: StrategicPlaybook,
    context: MatchingContext,
    options: {
      min_effectiveness?: number;
      prefer_recent?: boolean;
      guidance_level?: 'light' | 'medium' | 'intensive';
    } = {}
  ): Promise<PromptTemplate | null> {
    const applicableTemplates = await this.promptTemplateService.getTemplatesByTags(
      playbook.type_tags || []
    );

    if (applicableTemplates.length === 0) {
      return null;
    }

    // 过滤有效模板
    const effectiveTemplates = applicableTemplates.filter(t => {
      if (options.guidance_level && t.guidance_level !== options.guidance_level) {
        return false;
      }
      if (options.min_effectiveness && (t.effectiveness_score || 0) < options.min_effectiveness) {
        return false;
      }
      return true;
    });

    if (effectiveTemplates.length === 0) {
      return applicableTemplates[0]; // 回退到第一个
    }

    // 评分排序
    const scored = await Promise.all(
      effectiveTemplates.map(async (template) => {
        const score = await this.calculateTemplateScore(template, playbook, context);
        return { template, score };
      })
    );

    scored.sort((a, b) => b.score - a.score);

    return scored[0].template;
  }

  /**
   * 评估模板效果
   */
  async evaluateTemplate(
    templateId: string,
    outcome: {
      success: boolean;
      satisfaction?: number; // [1-10]
      response_time?: number;
      feedback?: string;
    }
  ): Promise<void> {
    await this.effectivenessTracker.recordUsage(templateId, outcome);

    // 更新效果评分
    const stats = await this.effectivenessTracker.getStats(templateId);
    await this.promptTemplateService.updateEffectiveness(templateId, {
      usage_count: stats.usage_count,
      effectiveness_score: stats.avg_satisfaction / 10
    });
  }

  // ========== 私有方法 ==========

  private async extractVariables(
    playbook: StrategicPlaybook,
    additionalVars: Record<string, any>
  ): Promise<Record<string, any>> {
    const variables: Record<string, any> = {
      // 从 playbook 提取
      goal: playbook.description,
      steps: this.formatSteps(playbook.actions),
      cautions: this.extractCautions(playbook),
      expected_outcome: this.extractExpectedOutcome(playbook),

      // 从上下文提取
      domain: playbook.context.domain,
      scenario: playbook.context.scenario,
      complexity: playbook.context.complexity,

      // 额外的变量
      ...additionalVars
    };

    // 使用 VariableEngine 解析嵌套变量
    return await this.variableEngine.resolveVariables(variables);
  }

  private applyVariables(content: string, variables: Record<string, any>): string {
    let result = content;

    // 替换所有 {variable} 占位符
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      const replacement = Array.isArray(value) ? value.join(', ') : String(value);
      result = result.replace(new RegExp(escapeRegExp(placeholder), 'g'), replacement);
    }

    return result;
  }

  private adjustFormatting(content: string, options: TemplateRenderOptions): string {
    let result = content;

    // 根据语言调整
    if (options.language === 'zh') {
      result = this.adjustChineseFormatting(result);
    }

    // 根据语调调整
    switch (options.tone) {
      case 'professional':
        result = this.toProfessionalTone(result);
        break;
      case 'friendly':
        result = this.toFriendlyTone(result);
        break;
      case 'concise':
        result = this.toConciseTone(result);
        break;
    }

    return result;
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // 智能截断，保留完整句子
    const truncated = content.substring(0, maxLength);
    const lastSentence = truncated.lastIndexOf('。');

    if (lastSentence > maxLength * 0.8) {
      return truncated.substring(0, lastSentence + 1);
    }

    return truncated + '...';
  }

  private async calculateTemplateScore(
    template: PromptTemplate,
    playbook: StrategicPlaybook,
    context: MatchingContext
  ): Promise<number> {
    let score = 0;

    // 1. 效果评分 (40%)
    score += (template.effectiveness_score || 0.5) * 0.4;

    // 2. 适用性 (30%)
    const tagMatch = this.calculateTagMatch(template.applicable_tags, playbook.type_tags || []);
    score += tagMatch * 0.3;

    // 3. 使用频率 (20%)
    const usageScore = Math.min(template.usage_count / 100, 1);
    score += usageScore * 0.2;

    // 4. 时效性 (10%)
    const recencyScore = this.calculateRecencyScore(template.updated_at);
    score += recencyScore * 0.1;

    return score;
  }

  private calculateTagMatch(templateTags: string[], playbookTags: string[]): number {
    if (templateTags.length === 0) return 0.5;

    const matches = templateTags.filter(tag => playbookTags.includes(tag));
    return matches.length / templateTags.length;
  }

  private calculateRecencyScore(updatedAt: number): number {
    const daysSinceUpdate = (Date.now() - updated_at) / (24 * 60 * 60 * 1000);
    return Math.max(0, 1 - (daysSinceUpdate / 365));
  }

  private formatSteps(actions: PlaybookAction[]): string {
    return actions
      .map((action, index) => `${index + 1}. ${action.description}`)
      .join('\n');
  }

  private extractCautions(playbook: StrategicPlaybook): string[] {
    // 从 playbook 中提取注意事项
    // 可以从 metadata 或现有字段中提取
    return [];
  }

  private extractExpectedOutcome(playbook: StrategicPlaybook): string {
    // 从 actions 中提取预期结果
    const outcomes = playbook.actions.map(a => a.expectedOutcome);
    return outcomes.join('; ');
  }

  private adjustChineseFormatting(content: string): string {
    // 中文格式化调整
    return content;
  }

  private toProfessionalTone(content: string): string {
    // 转换为专业语调
    return content
      .replace(/!/g, '。')
      .replace(/？/g, '？');
  }

  private toFriendlyTone(content: string): string {
    // 转换为友好语调
    return content;
  }

  private toConciseTone(content: string): string {
    // 转换为简洁语调
    return content.replace(/\s+/g, ' ').trim();
  }

  private estimateTokenCount(content: string): number {
    // 简单估算：中文约 1 token/字符，英文约 4 字符/token
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = content.length - chineseChars;

    return Math.ceil(chineseChars + englishChars / 4);
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

## 4. PlaybookInjector - 提示词注入器

### 4.1 职责概述
替代 PlaybookExecutor，将 Playbook 指导内容注入到 LLM 推理链中，支持注入强度控制和失败回退机制。

### 4.2 类设计

```typescript
interface InjectionContext {
  playbook: StrategicPlaybook;
  template: PromptTemplate;
  rendered_content: string;
  guidance_level: 'light' | 'medium' | 'intensive';
  injection_point: 'system_prompt' | 'user_message' | 'thinking_chain';
}

interface InjectionResult {
  success: boolean;
  injected_content: string;
  guidance_applied: boolean;
  fallback_triggered: boolean;
  reason?: string;
}

class PlaybookInjector {
  private templateManager: PlaybookTemplateManager;
  private systemPromptService: SystemPromptService;
  private logger: Logger;

  constructor(
    templateManager: PlaybookTemplateManager,
    systemPromptService: SystemPromptService
  ) {
    this.templateManager = templateManager;
    this.systemPromptService = systemPromptService;
  }

  /**
   * 主要注入方法
   */
  async injectGuidance(
    playbook: StrategicPlaybook,
    context: MatchingContext,
    options: {
      guidance_level?: 'light' | 'medium' | 'intensive';
      max_retry?: number;
      fallback_enabled?: boolean;
    } = {}
  ): Promise<InjectionResult> {
    const config = {
      guidance_level: options.guidance_level || playbook.guidance_level || 'medium',
      max_retry: options.max_retry || 2,
      fallback_enabled: options.fallback_enabled !== false
    };

    try {
      // 1. 选择最佳模板
      const template = await this.templateManager.selectBestTemplate(playbook, context, {
        guidance_level: config.guidance_level
      });

      if (!template) {
        return {
          success: false,
          injected_content: '',
          guidance_applied: false,
          fallback_triggered: true,
          reason: 'no_suitable_template'
        };
      }

      // 2. 渲染模板
      const renderResult = await this.templateManager.renderTemplate(
        template.template_id,
        playbook,
        {
          variables: this.buildVariables(playbook, context),
          guidance_level: config.guidance_level
        }
      );

      // 3. 执行注入
      const injectionContext: InjectionContext = {
        playbook,
        template,
        rendered_content: renderResult.content,
        guidance_level: config.guidance_level,
        injection_point: this.determineInjectionPoint(config.guidance_level)
      };

      const result = await this.performInjection(injectionContext);

      // 4. 记录效果
      await this.templateManager.evaluateTemplate(template.template_id, {
        success: result.success,
        response_time: Date.now()
      });

      return result;

    } catch (error) {
      this.logger.error('[PlaybookInjector] 注入失败', error);

      if (config.fallback_enabled) {
        return {
          success: false,
          injected_content: '',
          guidance_applied: false,
          fallback_triggered: true,
          reason: 'injection_error'
        };
      }

      throw error;
    }
  }

  /**
   * 执行注入
   */
  private async performInjection(context: InjectionContext): Promise<InjectionResult> {
    switch (context.injection_point) {
      case 'system_prompt':
        return this.injectToSystemPrompt(context);
      case 'user_message':
        return this.injectToUserMessage(context);
      case 'thinking_chain':
        return this.injectToThinkingChain(context);
      default:
        return {
          success: false,
          injected_content: '',
          guidance_applied: false,
          fallback_triggered: false,
          reason: 'invalid_injection_point'
        };
    }
  }

  /**
   * 注入到系统提示词
   */
  private async injectToSystemPrompt(context: InjectionContext): Promise<InjectionResult> {
    // 将指导内容注入到系统提示词
    const systemPrompt = await this.systemPromptService.getSystemPrompt();

    const enhancedPrompt = `${systemPrompt}\n\n${this.formatForSystemPrompt(context)}`;

    await this.systemPromptService.setSystemPrompt(enhancedPrompt);

    return {
      success: true,
      injected_content: enhancedPrompt,
      guidance_applied: true,
      fallback_triggered: false
    };
  }

  /**
   * 注入到用户消息
   */
  private async injectToUserMessage(context: InjectionContext): Promise<InjectionResult> {
    // 将指导内容作为用户消息的一部分
    const userMessage = `请参考以下指导：\n\n${context.rendered_content}`;

    return {
      success: true,
      injected_content: userMessage,
      guidance_applied: true,
      fallback_triggered: false
    };
  }

  /**
   * 注入到思考链
   */
  private async injectToThinkingChain(context: InjectionContext): Promise<InjectionResult> {
    // 为 ReAct 思考链准备指导内容
    const thoughtGuidance = this.formatForThinkingChain(context);

    return {
      success: true,
      injected_content: thoughtGuidance,
      guidance_applied: true,
      fallback_triggered: false
    };
  }

  // ========== 私有方法 ==========

  private determineInjectionPoint(
    guidance_level: 'light' | 'medium' | 'intensive'
  ): 'system_prompt' | 'user_message' | 'thinking_chain' {
    switch (guidance_level) {
      case 'light':
        return 'thinking_chain'; // 轻度：仅影响思考
      case 'medium':
        return 'user_message';   // 中度：用户消息级别
      case 'intensive':
        return 'system_prompt';  // 重度：系统级别
      default:
        return 'user_message';
    }
  }

  private buildVariables(playbook: StrategicPlaybook, context: MatchingContext): Record<string, any> {
    return {
      // Playbook 核心信息
      playbook_name: playbook.name,
      playbook_description: playbook.description,
      goal: playbook.description,
      steps: playbook.actions.map(a => a.description).join(' → '),
      expected_outcome: playbook.actions.map(a => a.expectedOutcome).join('; '),

      // 上下文信息
      user_query: context.userQuery,
      domain: playbook.context.domain,
      scenario: playbook.context.scenario,

      // 时间信息
      current_time: new Date().toLocaleString('zh-CN')
    };
  }

  private formatForSystemPrompt(context: InjectionContext): string {
    return `
## Playbook 指导 (${context.playbook.name})

${context.rendered_content}

请在处理用户请求时参考以上指导。`;
  }

  private formatForThinkingChain(context: InjectionContext): string {
    return `根据 Playbook "${context.playbook.name}" 的指导：
${context.rendered_content}

请在思考中参考这些要点。`;
  }

  private formatForUserMessage(context: InjectionContext): string {
    return `【任务指导】

${context.rendered_content}

请按照以上指导完成当前任务。`;
  }
}
```

## 5. 增强 PlaybookMatcher

### 5.1 改造要点
在现有 PlaybookMatcher 基础上，支持：
- 多标签匹配算法
- 置信度计算
- 标签相似度检索
- 动态类型支持

### 5.2 核心改造

```typescript
// 在 PlaybookMatcher.ts 中新增方法

class PlaybookMatcher {
  // ... 现有代码 ...

  /**
   * 多标签动态匹配 (新方法)
   */
  async matchPlaybooksDynamic(
    context: MatchingContext,
    config: PlaybookRecommendationConfig = PlaybookMatcher.DEFAULT_CONFIG
  ): Promise<PlaybookMatch[]> {
    try {
      // 1. 获取动态类型词汇表
      const typeVocabulary = await this.typeVocabularyService.getAllTags();

      // 2. 从查询中提取类型信号
      const typeSignals = await this.extractTypeSignals(context.userQuery, typeVocabulary);

      // 3. 基于类型信号检索候选 Playbook
      const typeBasedCandidates = await this.findPlaybooksByTypeSignals(typeSignals);

      // 4. 计算多标签匹配分数
      const matches = await Promise.all(
        typeBasedCandidates.map(pb => this.calculateMultiTagMatchScore(pb, context, typeSignals))
      );

      // 5. 过滤和排序
      return matches
        .filter(m => m.matchScore >= config.minMatchScore)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, config.maxRecommendations);

    } catch (error) {
      this.logger.error('[PlaybookMatcher] 动态匹配失败', error);
      return [];
    }
  }

  /**
   * 计算多标签匹配分数
   */
  private async calculateMultiTagMatchScore(
    playbook: StrategicPlaybook,
    context: MatchingContext,
    typeSignals: Map<string, number>
  ): Promise<PlaybookMatch> {
    let totalScore = 0;
    const matchReasons: string[] = [];
    const tagScores: Array<{tag: string, score: number}> = [];

    const playbookTags = playbook.type_tags || [];
    const playbookConfidences = playbook.type_confidence || {};

    // 1. 标签完全匹配
    for (const tag of playbookTags) {
      const signalStrength = typeSignals.get(tag) || 0;
      const confidence = playbookConfidences[tag] || 0.5;

      if (signalStrength > 0.7) {
        const score = signalStrength * confidence * 1.0; // 完全匹配权重 1.0
        totalScore += score;
        tagScores.push({ tag, score });
        matchReasons.push(`标签 "${tag}" 完全匹配 (${(score * 100).toFixed(0)}%)`);
      }
    }

    // 2. 标签语义相似匹配
    for (const tag of playbookTags) {
      const similarTags = await this.similarityService.getSimilarTags(tag, 0.7);

      for (const similar of similarTags) {
        const signalStrength = typeSignals.get(similar.tag1 === tag ? similar.tag2 : similar.tag1) || 0;
        if (signalStrength > 0.6) {
          const confidence = playbookConfidences[tag] || 0.5;
          const score = signalStrength * confidence * similar.similarity_score * 0.8; // 语义相似权重 0.8
          totalScore += score;
          matchReasons.push(`标签 "${tag}" 语义相似 (${(score * 100).toFixed(0)}%)`);
        }
      }
    }

    // 3. 标签共现模式匹配
    const cooccurrenceScore = await this.calculateCooccurrenceScore(playbookTags, typeSignals);
    totalScore += cooccurrenceScore * 0.6; // 共现模式权重 0.6

    // 4. 其他因素 (保持现有逻辑)
    const contextScore = this.calculateContextMatch(playbook, context) * 0.2;
    const usageScore = Math.min(playbook.metrics.usageCount / 100, 1) * 0.1;
    const recencyScore = this.calculateRecencyScore(playbook.metrics.lastUsed) * 0.1;

    totalScore += contextScore + usageScore + recencyScore;

    // 归一化到 [0, 1]
    const normalizedScore = Math.min(totalScore, 1);

    return {
      playbook,
      matchScore: normalizedScore,
      matchReasons,
      applicableSteps: playbook.actions.map((_, i) => i),
      tagScores // 新增：详细标签分数
    };
  }

  /**
   * 提取类型信号
   */
  private async extractTypeSignals(
    query: string,
    typeVocabulary: TypeVocabulary[]
  ): Promise<Map<string, number>> {
    const signals = new Map<string, number>();
    const queryLower = query.toLowerCase();

    for (const type of typeVocabulary) {
      // 计算查询与类型关键词的匹配度
      let matchCount = 0;
      for (const keyword of type.keywords) {
        if (queryLower.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      }

      // 信号强度 = 匹配关键词数 / 总关键词数
      const signalStrength = type.keywords.length > 0
        ? matchCount / type.keywords.length
        : 0;

      if (signalStrength > 0) {
        signals.set(type.tag_name, signalStrength);
      }
    }

    return signals;
  }

  /**
   * 基于类型信号检索 Playbook
   */
  private async findPlaybooksByTypeSignals(
    typeSignals: Map<string, number>
  ): Promise<StrategicPlaybook[]> {
    const strongSignals = Array.from(typeSignals.entries())
      .filter(([_, strength]) => strength > 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // 取前5个强信号
      .map(([tag, _]) => tag);

    if (strongSignals.length === 0) {
      // 回退到向量检索
      return await this.fallbackVectorSearch();
    }

    // 基于类型标签检索
    const playbooks = await this.playbookTypeService.getPlaybooksByTags(strongSignals);
    return playbooks.map(p => p.playbook);
  }

  /**
   * 计算标签共现分数
   */
  private async calculateCooccurrenceScore(
    playbookTags: string[],
    typeSignals: Map<string, number>
  ): Promise<number> {
    if (playbookTags.length < 2) return 0;

    let totalCooccurrence = 0;
    let pairCount = 0;

    for (let i = 0; i < playbookTags.length; i++) {
      for (let j = i + 1; j < playbookTags.length; j++) {
        const tag1 = playbookTags[i];
        const tag2 = playbookTags[j];

        const similarity = await this.similarityService.calculateSimilarity(tag1, tag2);
        const signal1 = typeSignals.get(tag1) || 0;
        const signal2 = typeSignals.get(tag2) || 0;

        totalCooccurrence += similarity * (signal1 + signal2) / 2;
        pairCount++;
      }
    }

    return pairCount > 0 ? totalCooccurrence / pairCount : 0;
  }

  private async fallbackVectorSearch(): Promise<StrategicPlaybook[]> {
    // 回退到原有的向量检索逻辑
    const candidates = await this.toolRetrievalService.findRelevantSkills(
      'strategic_playbook',
      20,
      0.4
    );

    return candidates
      .map(r => this.parsePlaybookFromVector(r.tool))
      .filter((p): p is StrategicPlaybook => p !== null);
  }
}
```

## 6. 组件集成流程

### 6.1 ReActStrategy 集成流程

```typescript
// 在 ReActStrategy.prepare() 中的集成

class ReActStrategy {
  async prepare(
    messages: Message[],
    options: ChatOptions
  ): Promise<{ variables: Record<string, any>, tools: Tool[] }> {
    // 1. 初始化工具系统
    const tools = await this.initializeTools(options);

    // 2. 🎯 新增：Playbook 匹配和注入
    const playbookGuidance = await this.matchAndInjectPlaybooks(messages, options);

    // 3. 返回变量 (包含 Playbook 指导)
    return {
      tools,
      variables: {
        ...playbookGuidance, // Playbook 指导变量
        // ... 其他变量
      }
    };
  }

  private async matchAndInjectPlaybooks(
    messages: Message[],
    options: ChatOptions
  ): Promise<Record<string, any>> {
    const userMessage = messages[messages.length - 1];

    const context: MatchingContext = {
      userQuery: typeof userMessage.content === 'string'
        ? userMessage.content
        : JSON.stringify(userMessage.content)
    };

    // 1. 匹配 Playbook
    const matches = await this.playbookMatcher.matchPlaybooksDynamic(context);

    if (matches.length === 0) {
      return {}; // 无匹配，返回空
    }

    const bestMatch = matches[0];
    const playbook = bestMatch.playbook;

    // 2. 注入提示词指导
    const injectionResult = await this.playbookInjector.injectGuidance(
      playbook,
      context,
      {
        guidance_level: options.playbook_guidance_level || 'medium'
      }
    );

    if (!injectionResult.success) {
      return {}; // 注入失败，返回空
    }

    // 3. 返回指导变量
    return {
      playbook_guidance: injectionResult.injected_content,
      playbook_name: playbook.name,
      playbook_tags: playbook.type_tags,
      guidance_applied: true
    };
  }
}
```

### 6.2 完整数据流

```
1. 用户查询
   ↓
2. ReActStrategy.prepare()
   ↓
3. PlaybookMatcher.matchPlaybooksDynamic()
   ├─ 提取类型信号
   ├─ 多标签匹配
   └─ 计算匹配分数
   ↓
4. PlaybookInjector.injectGuidance()
   ├─ 选择模板
   ├─ 渲染内容
   └─ 注入到上下文
   ↓
5. ChatService.prepareMessages()
   ├─ 系统提示词 + Playbook指导
   └─ 变量替换
   ↓
6. LLM 推理增强
   ↓
7. 效果评估和优化
```

---

**下一步行动**: 请查看 `04-API-DESIGN.md` 了解 API 接口设计。
