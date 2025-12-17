import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PlaybookManager } from '../../src/services/PlaybookManager';
import { TrajectoryStore } from '../../src/services/TrajectoryStore';
import { Trajectory } from '../../src/types/trajectory';
import { ToolRetrievalService } from '../../src/services/ToolRetrievalService';
import { LLMManager } from '../../src/core/LLMManager';
import { AceStrategyManager } from '../../src/services/AceStrategyManager';
import { AceIntegrator } from '../../src/services/AceIntegrator';
import { ConfigService } from '../../src/services/ConfigService';

describe('Stage 2: Generator Batch Extraction', () => {
  let playbookManager: PlaybookManager;
  let trajectoryStore: TrajectoryStore;

  beforeAll(async () => {
    console.log('🔧 初始化 Generator Batch Extraction 测试环境...');

    // 初始化基础服务
    const llmManager = new LLMManager();
    const configService = ConfigService.getInstance();

    const toolRetrievalConfig = {
      vectorDbPath: './data/test-lancedb',
      model: 'all-MiniLM-L6-v2',
      dimensions: 384,
      similarityThreshold: 0.5,
      cacheSize: 100,
      maxResults: 10
    };
    const toolRetrievalService = new ToolRetrievalService(toolRetrievalConfig);
    await toolRetrievalService.initialize();

    const { AceService } = await import('../../src/services/AceService');
    const aceService = AceService.getInstance();

    const aceIntegrator = new AceIntegrator(aceService, llmManager);
    const aceStrategyManager = new AceStrategyManager(aceIntegrator, toolRetrievalService, llmManager);

    // 初始化 TrajectoryStore
    trajectoryStore = TrajectoryStore.getInstance();

    // 初始化 PlaybookManager
    playbookManager = new PlaybookManager(
      aceStrategyManager,
      toolRetrievalService,
      llmManager
    );
  });

  afterAll(async () => {
    // 清理测试数据
    try {
      await trajectoryStore.cleanup(0);
    } catch (error) {
      console.warn('清理测试数据失败:', error);
    }
  });

  describe('场景1: 聚类 10 个相似 Trajectory 为 2-3 个簇', () => {
    it('应该将 10 个 Trajectory 聚类为 2-3 个有效的簇', () => {
      const trajectories: Trajectory[] = [
        // 簇 1: 用户反馈分析（5 个）
        ...createMockTrajectories(5, '分析用户反馈', ['feedback-analyzer']),
        // 簇 2: 代码生成（3 个）
        ...createMockTrajectories(3, '生成代码', ['code-generator']),
        // 噪声（2 个不相似的）
        ...createMockTrajectories(2, '随机任务', ['random-tool'])
      ];

      const clusters = (playbookManager as any).clusterTrajectories(trajectories, {
        minClusterSize: 3,
        minSimilarity: 0.7,
        maxClusters: 10,
        lookbackDays: 7
      });

      expect(clusters.length).toBeGreaterThanOrEqual(2);
      expect(clusters.length).toBeLessThanOrEqual(3);

      // 验证簇大小
      clusters.forEach(cluster => {
        expect(cluster.trajectories.length).toBeGreaterThanOrEqual(3);
      });

      // 验证每个簇都有必要的属性
      clusters.forEach(cluster => {
        expect(cluster.cluster_id).toBeTruthy();
        expect(cluster.common_keywords).toBeInstanceOf(Array);
        expect(cluster.common_tools).toBeInstanceOf(Array);
        expect(cluster.representative_input).toBeTruthy();
        expect(cluster.confidence).toBeGreaterThan(0);
        expect(cluster.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('场景2: 从簇中提取通用 Playbook', () => {
    it('应该从簇中提取包含 batch-extracted 标签的 Playbook', async () => {
      const cluster = {
        cluster_id: 'test-cluster',
        trajectories: createMockTrajectories(5, '分析用户反馈', ['feedback-analyzer']),
        common_keywords: ['分析', '用户', '反馈'],
        common_tools: ['feedback-analyzer'],
        representative_input: '分析最近一周的用户反馈',
        confidence: 0.85
      };

      const playbook = await (playbookManager as any).extractFromCluster(cluster);

      expect(playbook.name).toBeTruthy();
      expect(playbook.tags).toContain('batch-extracted');
      expect(playbook.tags).toContain('分析');
      expect(playbook.tags).toContain('用户');
      expect(playbook.tags).toContain('反馈');
      expect(playbook.sourceTrajectoryIds).toHaveLength(5);
      expect(playbook.metrics.successRate).toBeGreaterThan(0.5);
      expect(playbook.metrics.timeToResolution).toBeGreaterThan(0);
    }, 30000);
  });

  describe('场景3: 批量提取生成多个 Playbook', () => {
    it('应该批量提取生成多个 Playbook（簇数量 >=2）', async () => {
      const trajectories: Trajectory[] = [
        ...createMockTrajectories(5, '分析用户反馈', ['feedback-analyzer']),
        ...createMockTrajectories(4, '生成代码', ['code-generator']),
        ...createMockTrajectories(3, '翻译文档', ['translator'])
      ];

      const playbooks = await playbookManager.batchExtractPlaybooks(trajectories, {
        minClusterSize: 3,
        minSimilarity: 0.7,
        maxClusters: 5
      });

      expect(playbooks.length).toBeGreaterThanOrEqual(2);
      expect(playbooks.length).toBeLessThanOrEqual(3);

      // 验证每个 Playbook 都有来源
      playbooks.forEach(pb => {
        expect(pb.sourceTrajectoryIds.length).toBeGreaterThanOrEqual(3);
        expect(pb.tags).toContain('batch-extracted');
      });
    }, 60000);
  });

  describe('场景4: 过滤小簇（<3 个样本）', () => {
    it('应该过滤小于最小簇大小的簇，不生成 Playbook', async () => {
      const trajectories: Trajectory[] = [
        ...createMockTrajectories(5, '分析用户反馈', ['feedback-analyzer']),
        ...createMockTrajectories(2, '小簇任务', ['small-tool'])  // 只有 2 个，不满足 minClusterSize=3
      ];

      const playbooks = await playbookManager.batchExtractPlaybooks(trajectories, {
        minClusterSize: 3
      });

      // 只应该生成 1 个 Playbook（小簇被过滤）
      expect(playbooks.length).toBe(1);
      expect(playbooks[0].tags).toContain('batch-extracted');
    }, 30000);
  });

  describe('场景5: 计算关键词相似度', () => {
    it('应该正确计算 Jaccard 系数', () => {
      const keywords1 = ['分析', '用户', '反馈', '数据'];
      const keywords2 = ['分析', '用户', '意见', '数据'];

      const similarity = (playbookManager as any).calculateKeywordSimilarity(keywords1, keywords2);

      // Jaccard 系数: 交集 {分析, 用户, 数据} = 3, 并集 {分析, 用户, 反馈, 数据, 意见} = 5
      // similarity = 3/5 = 0.6
      expect(similarity).toBeCloseTo(0.6, 2);
    });

    it('应该正确计算完全相同的关键词相似度', () => {
      const keywords1 = ['分析', '用户', '反馈'];
      const keywords2 = ['分析', '用户', '反馈'];

      const similarity = (playbookManager as any).calculateKeywordSimilarity(keywords1, keywords2);

      // 完全相同，相似度为 1.0
      expect(similarity).toBe(1.0);
    });

    it('应该正确计算无重叠关键词相似度', () => {
      const keywords1 = ['分析', '用户'];
      const keywords2 = ['生成', '代码'];

      const similarity = (playbookManager as any).calculateKeywordSimilarity(keywords1, keywords2);

      // 无重叠，相似度为 0
      expect(similarity).toBe(0);
    });
  });

  describe('辅助功能测试', () => {
    it('应该正确提取关键词', () => {
      const text = '分析用户反馈数据，提取关键意见';
      const keywords = (playbookManager as any).extractKeywords(text);

      // 2-4字符组合，保留语义信息
      expect(keywords).toContain('分析用户');
      expect(keywords).toContain('反馈数据');
      expect(keywords).toContain('提取关键');
      expect(keywords).toContain('意见');

      // 应该过滤停用词
      expect(keywords).not.toContain('的');
      expect(keywords).not.toContain('了');
    });

    it('应该正确提取常用工具', () => {
      const trajectories = createMockTrajectories(5, '分析用户反馈', ['feedback-analyzer']);
      const commonTools = (playbookManager as any).extractCommonTools(trajectories);

      expect(commonTools).toContain('feedback-analyzer');
    });

    it('应该正确计算簇置信度', () => {
      const smallCluster = createMockTrajectories(3, '分析', ['tool1']);
      const largeCluster = createMockTrajectories(10, '分析', ['tool1']);

      const smallConfidence = (playbookManager as any).calculateClusterConfidence(smallCluster);
      const largeConfidence = (playbookManager as any).calculateClusterConfidence(largeCluster);

      // 3 个样本应该约为 0.6
      expect(smallConfidence).toBeCloseTo(0.6, 2);
      // 10 个样本应该接近或等于 1.0
      expect(largeConfidence).toBeCloseTo(1.0, 2);
    });

    it('应该正确计算平均执行时间', () => {
      const trajectories = [
        createMockTrajectories(1, '分析1', ['tool1'])[0],
        createMockTrajectories(1, '分析2', ['tool1'])[0],
        createMockTrajectories(1, '分析3', ['tool1'])[0]
      ];

      trajectories[0].duration_ms = 1000;
      trajectories[1].duration_ms = 2000;
      trajectories[2].duration_ms = 3000;

      const avgDuration = (playbookManager as any).calculateAvgDuration(trajectories);

      // (1000 + 2000 + 3000) / 3 = 2000
      expect(avgDuration).toBe(2000);
    });
  });
});

/**
 * 辅助函数：创建模拟 Trajectory
 */
function createMockTrajectories(
  count: number,
  baseInput: string,
  tools: string[]
): Trajectory[] {
  return Array.from({ length: count }, (_, i) => ({
    task_id: `traj-${baseInput}-${i}`,
    user_input: `${baseInput} ${i + 1}`,
    steps: tools.map(tool => ({
      thought: `使用 ${tool}`,
      action: `call_tool: ${tool}`,
      output: 'success',
      tool_details: {
        tool_name: tool,
        input_params: {},
        output_content: 'success'
      },
      duration: 1000,
      timestamp: Date.now()
    })),
    final_result: '成功完成',
    outcome: 'SUCCESS' as const,
    environment_feedback: '',
    used_rule_ids: [],
    timestamp: Date.now(),
    duration_ms: 1000,
    evolution_status: 'PENDING' as const
  }));
}
