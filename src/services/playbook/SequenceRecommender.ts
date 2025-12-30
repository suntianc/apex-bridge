/**
 * SequenceRecommender - Playbook 序列推荐器
 *
 * 负责推荐 Playbook 的最优执行序列，包括：
 * - 构建 LLM 提示词
 * - 解析 LLM 响应
 * - 计算估计成功率
 * - 构建依赖关系图
 */

import { LLMManager } from '../../core/LLMManager';
import {
  StrategicPlaybook,
  PlaybookMatch,
  MatchingContext,
} from '../../core/playbook/types';
import { logger } from '../../utils/logger';
import {
  ISequenceRecommender,
  SequenceResult,
  DependencyGraph,
  DependencyNode,
  DependencyEdge,
  DependencyType,
} from './PlaybookMatcher.types';

/**
 * 序列推荐器实现
 * 负责推荐 Playbook 的最优执行序列
 */
export class SequenceRecommender implements ISequenceRecommender {
  private llmManager: LLMManager;

  constructor(llmManager: LLMManager) {
    this.llmManager = llmManager;
  }

  /**
   * 推荐执行序列
   *
   * 流程：
   * 1. 构建 LLM 提示词
   * 2. 调用 LLM 分析最佳序列
   * 3. 解析响应，提取推荐序列
   * 4. 计算估计成功率
   */
  async recommendSequence(
    context: MatchingContext,
    targetOutcome: string,
    matches: PlaybookMatch[]
  ): Promise<SequenceResult> {
    try {
      if (matches.length === 0) {
        return {
          sequence: [],
          rationale: '未找到合适的 Playbook',
          estimatedSuccessRate: 0,
        };
      }

      // 第一步：构建 LLM 提示词
      const prompt = this.buildSequencePrompt(context, targetOutcome, matches);

      // 第二步：调用 LLM 分析最佳序列
      const response = await this.llmManager.chat(
        [
          {
            role: 'user' as const,
            content: prompt
          }
        ],
        { stream: false }
      );

      const content = (response.choices[0]?.message?.content as string) || '';

      // 第三步：解析响应，提取推荐序列
      const sequence = this.parseSequenceFromResponse(content, matches);

      // 第四步：计算估计成功率
      const estimatedSuccessRate = this.calculateSequenceSuccessRate(sequence);

      // 第五步：提取理由
      const rationale = this.extractRationale(content) || '基于成功率和上下文匹配的智能推荐';

      return {
        sequence,
        rationale,
        estimatedSuccessRate,
      };

    } catch (error) {
      logger.error('[SequenceRecommender] 推荐序列失败:', error);
      return {
        sequence: [],
        rationale: '分析过程中发生错误',
        estimatedSuccessRate: 0,
      };
    }
  }

  /**
   * 构建序列推荐提示词
   */
  private buildSequencePrompt(
    context: MatchingContext,
    targetOutcome: string,
    matches: PlaybookMatch[]
  ): string {
    const playbookList = matches.map((m, i) => `
${i + 1}. ${m.playbook.name}
   描述: ${m.playbook.description}
   成功率: ${(m.playbook.metrics.successRate * 100).toFixed(0)}%
   步骤数: ${m.playbook.actions.length}
   匹配分数: ${(m.matchScore * 100).toFixed(0)}%
`).join('');

    return `
给定以下上下文和候选 Playbook，推荐一个最优的执行序列：

用户查询: ${context.userQuery}
目标结果: ${targetOutcome}
${context.domain ? `领域: ${context.domain}` : ''}

候选 Playbook:
${playbookList}

请推荐：
1. 最佳执行序列（按顺序编号）
2. 每个 Playbook 的使用理由
3. 整体估计成功率

请以 JSON 格式返回：
{
  "sequence": [1, 3, 2], // Playbook 编号
  "reasons": ["理由1", "理由2", "理由3"],
  "estimatedSuccessRate": 0.85,
  "rationale": "总体策略说明"
}
`;
  }

  /**
   * 从 LLM 响应中解析推荐序列
   */
  private parseSequenceFromResponse(
    response: string,
    matches: PlaybookMatch[]
  ): PlaybookMatch[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // 如果无法解析 JSON，返回前 3 个匹配
        return matches.slice(0, 3);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const sequence = parsed.sequence as number[];

      return sequence
        .map(idx => matches[idx - 1])
        .filter((m): m is PlaybookMatch => m !== undefined);
    } catch (error) {
      logger.error('[SequenceRecommender] 解析序列响应失败:', error);
      return matches.slice(0, 3);
    }
  }

  /**
   * 计算序列估计成功率
   *
   * 计算公式：
   * 序列成功率 = 第一个 Playbook 成功率 * 复杂度惩罚
   * 复杂度惩罚 = 0.95 ^ (序列长度 - 1)
   */
  private calculateSequenceSuccessRate(sequence: PlaybookMatch[]): number {
    if (sequence.length === 0) return 0;

    const baseRate = sequence[0].playbook.metrics.successRate;
    const complexityPenalty = Math.pow(0.95, sequence.length - 1);

    return Math.min(baseRate * complexityPenalty, 1);
  }

  /**
   * 从响应中提取理由
   */
  private extractRationale(response: string): string | null {
    const rationaleMatch = response.match(/"rationale":\s*"([^"]+)"/);
    return rationaleMatch?.[1] || null;
  }

  /**
   * 构建依赖关系图
   *
   * 根据 Playbook 的特性和关系构建依赖图：
   * 1. 基于领域：同一领域的 Playbook 可能有顺序依赖
   * 2. 基于复杂度：简单的 Playbook 可能在复杂的之前
   * 3. 基于标签：共享标签的 Playbook 可能有增强关系
   */
  async buildDependencyGraph(playbookIds: string[]): Promise<DependencyGraph> {
    // 简化实现：基于 Playbook ID 的拓扑排序
    // 实际实现需要从数据库获取更多 Playbook 信息

    const nodes: DependencyNode[] = [];
    const edges: DependencyEdge[] = [];

    // 创建节点
    for (let i = 0; i < playbookIds.length; i++) {
      nodes.push({
        playbookId: playbookIds[i],
        level: 0,
        dependencyCount: 0,
      });
    }

    // 创建边（简化版本：基于索引顺序）
    for (let i = 0; i < playbookIds.length - 1; i++) {
      edges.push({
        from: playbookIds[i],
        to: playbookIds[i + 1],
        type: DependencyType.SEQUENTIAL,
      });
    }

    // 计算层级
    const graph = this.calculateNodeLevels(nodes, edges);

    return {
      nodes: graph,
      edges,
    };
  }

  /**
   * 计算节点层级
   */
  private calculateNodeLevels(
    nodes: DependencyNode[],
    edges: DependencyEdge[]
  ): DependencyNode[] {
    // 构建入度映射
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.playbookId, 0);
      adjacency.set(node.playbookId, []);
    }

    for (const edge of edges) {
      const neighbors = adjacency.get(edge.from) || [];
      neighbors.push(edge.to);
      adjacency.set(edge.from, neighbors);

      const currentInDegree = inDegree.get(edge.to) || 0;
      inDegree.set(edge.to, currentInDegree + 1);
    }

    // 使用 Kahn 算法计算层级
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const levelMap = new Map<string, number>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentLevel = levelMap.get(current) || 0;

      levelMap.set(current, currentLevel);

      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        const newInDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newInDegree);

        if (newInDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // 更新节点的层级信息
    return nodes.map(node => ({
      ...node,
      level: levelMap.get(node.playbookId) || 0,
      dependencyCount: inDegree.get(node.playbookId) || 0,
    }));
  }

  /**
   * 计算最优执行顺序
   *
   * 基于依赖关系图和目标结果计算最优执行顺序：
   * 1. 按层级排序（先执行无依赖的）
   * 2. 同层级按成功率降序
   * 3. 考虑目标结果的相关性
   */
  async calculateOptimalOrder(
    graph: DependencyGraph,
    targetOutcome: string
  ): Promise<string[]> {
    // 按层级排序，同层级按依赖数量排序
    const sortedNodes = [...graph.nodes]
      .sort((a, b) => {
        // 先按层级排序
        if (a.level !== b.level) {
          return a.level - b.level;
        }
        // 同层级按依赖数量排序（依赖少的在前）
        return a.dependencyCount - b.dependencyCount;
      });

    return sortedNodes.map(node => node.playbookId);
  }
}
