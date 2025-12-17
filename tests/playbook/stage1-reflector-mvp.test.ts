import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PlaybookReflector } from '../../src/services/PlaybookReflector';
import { TrajectoryStore } from '../../src/services/TrajectoryStore';
import { Trajectory, ErrorType } from '../../src/types/trajectory';
import { PlaybookManager } from '../../src/services/PlaybookManager';
import { ToolRetrievalService } from '../../src/services/ToolRetrievalService';
import { LLMManager } from '../../src/core/LLMManager';
import { AceStrategyManager } from '../../src/services/AceStrategyManager';
import { AceIntegrator } from '../../src/services/AceIntegrator';
import { ConfigService } from '../../src/services/ConfigService';

describe('Stage 1: Reflector MVP', () => {
  let reflector: PlaybookReflector;
  let trajectoryStore: TrajectoryStore;
  let playbookManager: PlaybookManager;

  beforeAll(async () => {
    console.log('🔧 初始化 Reflector MVP 测试环境...');

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

    // 初始化 Reflector
    reflector = new PlaybookReflector(playbookManager);
  });

  afterAll(async () => {
    // 清理测试数据
    try {
      await trajectoryStore.cleanup(0);
    } catch (error) {
      console.warn('清理测试数据失败:', error);
    }
  });

  describe('场景1: 识别超时失败模式并生成风险规避 Playbook', () => {
    it('应该识别超时模式并生成包含分批处理的 Playbook', async () => {
      const failures: Trajectory[] = [
        {
          task_id: 'traj-fail-timeout-001',
          session_id: 'session-001',
          user_input: '分析 1000 条反馈',
          steps: [{
            thought: '调用 feedback-analyzer',
            action: 'call_tool: feedback-analyzer',
            output: '',
            tool_details: {
              tool_name: 'feedback-analyzer',
              input_params: { limit: 1000 },
              output_content: '',
              output_metadata: { execution_time_ms: 30000 }
            },
            error_details: {
              error_type: ErrorType.TIMEOUT,
              error_message: 'Timeout: tool execution exceeded 30s',
              context: { tool_name: 'feedback-analyzer', input_params: { limit: 1000 } }
            },
            duration: 30000,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '超时',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 30000,
          evolution_status: 'PENDING'
        },
        {
          task_id: 'traj-fail-timeout-002',
          session_id: 'session-002',
          user_input: '处理 5000 条数据',
          steps: [{
            thought: '调用 data-processor',
            action: 'call_tool: data-processor',
            output: '',
            error_details: {
              error_type: ErrorType.TIMEOUT,
              error_message: 'Request timeout after 30s',
              context: {}
            },
            duration: 30000,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '超时',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 30000,
          evolution_status: 'PENDING'
        }
      ];

      // 保存失败轨迹到数据库
      await trajectoryStore.saveBatch(failures);

      const playbooks = await reflector.analyzeFailurePatterns([], failures);

      // 验证生成风险规避 Playbook
      expect(playbooks.length).toBeGreaterThan(0);

      const timeoutPlaybook = playbooks.find(pb => pb.tags.includes('timeout'));
      expect(timeoutPlaybook).toBeDefined();
      expect(timeoutPlaybook!.type).toBe('problem_solving');
      expect(timeoutPlaybook!.tags).toContain('failure-derived');
      expect(timeoutPlaybook!.tags).toContain('risk-avoidance');
      expect(timeoutPlaybook!.tags).toContain(ErrorType.TIMEOUT);
      expect(timeoutPlaybook!.actions[0].description).toContain('分批处理');
      expect(timeoutPlaybook!.description).toContain('超时');
      expect(timeoutPlaybook!.description).toContain('反模式');
    });
  });

  describe('场景2: 识别速率限制失败模式', () => {
    it('应该识别速率限制模式并生成包含速率限制器的 Playbook', async () => {
      const failures: Trajectory[] = [
        {
          task_id: 'traj-fail-ratelimit-001',
          session_id: 'session-003',
          user_input: '批量查询用户信息',
          steps: [{
            thought: '调用 user-api',
            action: 'call_tool: user-api',
            output: '',
            error_details: {
              error_type: ErrorType.RATE_LIMIT,
              error_message: 'Rate limit exceeded: 429 Too Many Requests',
              context: {}
            },
            duration: 1000,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '速率限制',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 1000,
          evolution_status: 'PENDING'
        },
        {
          task_id: 'traj-fail-ratelimit-002',
          session_id: 'session-004',
          user_input: '批量发送通知',
          steps: [{
            thought: '调用 notification-api',
            action: 'call_tool: notification-api',
            output: '',
            error_details: {
              error_type: ErrorType.RATE_LIMIT,
              error_message: 'Too many requests',
              context: {}
            },
            duration: 500,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '速率限制',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 500,
          evolution_status: 'PENDING'
        }
      ];

      const playbooks = await reflector.analyzeFailurePatterns([], failures);

      const rateLimitPlaybook = playbooks.find(pb => pb.tags.includes('rate-limit'));
      expect(rateLimitPlaybook).toBeDefined();
      expect(rateLimitPlaybook!.actions[0].description).toContain('速率限制器');
      expect(rateLimitPlaybook!.description).toContain('API限流');
    });
  });

  describe('场景3: 识别资源耗尽失败模式', () => {
    it('应该识别资源耗尽模式并生成包含流式处理的 Playbook', async () => {
      const failures: Trajectory[] = [
        {
          task_id: 'traj-fail-resource-001',
          session_id: 'session-005',
          user_input: '处理大文件',
          steps: [{
            thought: '读取文件',
            action: 'call_tool: file-reader',
            output: '',
            tool_details: {
              tool_name: 'file-reader',
              input_params: { file_path: 'large-file.txt' },
              output_content: ''
            },
            error_details: {
              error_type: ErrorType.RESOURCE_EXHAUSTED,
              error_message: 'Out of memory: heap allocation failed',
              context: { file_size: '500MB' }
            },
            duration: 5000,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '资源耗尽',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 5000,
          evolution_status: 'PENDING'
        },
        {
          task_id: 'traj-fail-resource-002',
          session_id: 'session-006',
          user_input: '处理图像数据',
          steps: [{
            thought: '处理图像',
            action: 'call_tool: image-processor',
            output: '',
            tool_details: {
              tool_name: 'image-processor',
              input_params: { image_count: 10000 },
              output_content: ''
            },
            error_details: {
              error_type: ErrorType.RESOURCE_EXHAUSTED,
              error_message: 'JavaScript heap out of memory',
              context: {}
            },
            duration: 10000,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '资源耗尽',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 10000,
          evolution_status: 'PENDING'
        }
      ];

      const playbooks = await reflector.analyzeFailurePatterns([], failures);

      const resourcePlaybook = playbooks.find(pb => pb.tags.includes('resource'));
      expect(resourcePlaybook).toBeDefined();
      expect(resourcePlaybook!.actions[0].description).toContain('流式处理');
      expect(resourcePlaybook!.description).toContain('资源耗尽');
    });
  });

  describe('场景4: 过滤低置信度模式（只出现 1 次）', () => {
    it('只出现 1 次的错误不应该生成 Playbook', async () => {
      const failures: Trajectory[] = [
        {
          task_id: 'traj-fail-once-001',
          session_id: 'session-007',
          user_input: '单次失败案例',
          steps: [{
            thought: 'test',
            action: 'test',
            output: '',
            error_details: {
              error_type: ErrorType.NETWORK_ERROR,
              error_message: 'Connection refused',
              context: {}
            },
            duration: 100,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '网络错误',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 100,
          evolution_status: 'PENDING'
        }
      ];

      const playbooks = await reflector.analyzeFailurePatterns([], failures);

      // 只出现 1 次，不应该生成 Playbook
      expect(playbooks.length).toBe(0);
    });
  });

  describe('场景5: 提取涉及的工具名称', () => {
    it('Playbook 应该包含失败中涉及的工具名称', async () => {
      const failures: Trajectory[] = [
        {
          task_id: 'traj-fail-tools-001',
          session_id: 'session-008',
          user_input: '数据分析',
          steps: [{
            thought: 'test',
            action: 'test',
            output: '',
            tool_details: {
              tool_name: 'data-analyzer',
              input_params: {},
              output_content: ''
            },
            error_details: {
              error_type: ErrorType.RESOURCE_EXHAUSTED,
              error_message: 'Out of memory',
              context: {}
            },
            duration: 1000,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '资源耗尽',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 1000,
          evolution_status: 'PENDING'
        },
        {
          task_id: 'traj-fail-tools-002',
          session_id: 'session-009',
          user_input: '数据处理',
          steps: [{
            thought: 'test',
            action: 'test',
            output: '',
            tool_details: {
              tool_name: 'data-processor',
              input_params: {},
              output_content: ''
            },
            error_details: {
              error_type: ErrorType.RESOURCE_EXHAUSTED,
              error_message: 'Heap out of memory',
              context: {}
            },
            duration: 1000,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '资源耗尽',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 1000,
          evolution_status: 'PENDING'
        }
      ];

      const playbooks = await reflector.analyzeFailurePatterns([], failures);

      const resourcePlaybook = playbooks.find(pb => pb.tags.includes('resource'));
      expect(resourcePlaybook).toBeDefined();
      expect(resourcePlaybook!.actions[0].resources).toEqual(
        expect.arrayContaining(['data-analyzer', 'data-processor'])
      );
    });
  });

  describe('场景6: 权限不足失败模式识别', () => {
    it('应该识别权限错误并生成包含权限检查的 Playbook', async () => {
      const failures: Trajectory[] = [
        {
          task_id: 'traj-fail-permission-001',
          session_id: 'session-010',
          user_input: '访问受保护资源',
          steps: [{
            thought: '调用 API',
            action: 'call_tool: protected-api',
            output: '',
            error_details: {
              error_type: ErrorType.PERMISSION_DENIED,
              error_message: 'Permission denied: 403 Forbidden',
              context: { resource: 'admin-panel' }
            },
            duration: 500,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '权限不足',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 500,
          evolution_status: 'PENDING'
        },
        {
          task_id: 'traj-fail-permission-002',
          session_id: 'session-011',
          user_input: '调用管理接口',
          steps: [{
            thought: '调用管理 API',
            action: 'call_tool: admin-api',
            output: '',
            error_details: {
              error_type: ErrorType.PERMISSION_DENIED,
              error_message: 'Unauthorized access',
              context: {}
            },
            duration: 300,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '权限不足',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 300,
          evolution_status: 'PENDING'
        }
      ];

      const playbooks = await reflector.analyzeFailurePatterns([], failures);

      const permissionPlaybook = playbooks.find(pb => pb.tags.includes('permission'));
      expect(permissionPlaybook).toBeDefined();
      expect(permissionPlaybook!.actions[0].description).toContain('API Key');
      expect(permissionPlaybook!.description).toContain('权限不足');
    });
  });

  describe('场景7: 网络错误失败模式识别', () => {
    it('应该识别网络错误并生成包含重试机制的 Playbook', async () => {
      const failures: Trajectory[] = [
        {
          task_id: 'traj-fail-network-001',
          session_id: 'session-012',
          user_input: '调用外部服务',
          steps: [{
            thought: '调用外部 API',
            action: 'call_tool: external-api',
            output: '',
            error_details: {
              error_type: ErrorType.NETWORK_ERROR,
              error_message: 'ECONNREFUSED: connection refused',
              context: { host: 'api.example.com', port: 443 }
            },
            duration: 2000,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '网络错误',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 2000,
          evolution_status: 'PENDING'
        },
        {
          task_id: 'traj-fail-network-002',
          session_id: 'session-013',
          user_input: '连接数据库',
          steps: [{
            thought: '连接数据库',
            action: 'call_tool: db-connector',
            output: '',
            error_details: {
              error_type: ErrorType.NETWORK_ERROR,
              error_message: 'Network error: unable to connect',
              context: {}
            },
            duration: 1500,
            timestamp: Date.now()
          }],
          final_result: '',
          outcome: 'FAILURE',
          environment_feedback: '网络错误',
          used_rule_ids: [],
          timestamp: Date.now(),
          duration_ms: 1500,
          evolution_status: 'PENDING'
        }
      ];

      const playbooks = await reflector.analyzeFailurePatterns([], failures);

      const networkPlaybook = playbooks.find(pb => pb.tags.includes('network'));
      expect(networkPlaybook).toBeDefined();
      expect(networkPlaybook!.actions[0].description).toContain('重试');
      expect(networkPlaybook!.description).toContain('网络错误');
    });
  });

  describe('TrajectoryStore 功能测试', () => {
    it('应该能够保存和查询 Trajectory', async () => {
      const trajectory: Trajectory = {
        task_id: 'traj-store-test-001',
        session_id: 'session-store-test',
        user_input: '测试轨迹存储',
        steps: [{
          thought: '测试',
          action: 'test',
          output: 'test output',
          duration: 100,
          timestamp: Date.now()
        }],
        final_result: 'test result',
        outcome: 'SUCCESS',
        environment_feedback: 'success',
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 100,
        evolution_status: 'COMPLETED'
      };

      await trajectoryStore.save(trajectory);
      const retrieved = await trajectoryStore.getById('traj-store-test-001');

      expect(retrieved).toBeDefined();
      expect(retrieved!.task_id).toBe(trajectory.task_id);
      expect(retrieved!.outcome).toBe('SUCCESS');
    });

    it('应该能够获取最近的成功和失败轨迹', async () => {
      const success1: Trajectory = {
        task_id: 'traj-success-001',
        session_id: 'session-test',
        user_input: '成功案例1',
        steps: [],
        final_result: 'success',
        outcome: 'SUCCESS',
        environment_feedback: 'success',
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 100,
        evolution_status: 'COMPLETED'
      };

      const success2: Trajectory = {
        task_id: 'traj-success-002',
        session_id: 'session-test',
        user_input: '成功案例2',
        steps: [],
        final_result: 'success',
        outcome: 'SUCCESS',
        environment_feedback: 'success',
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 100,
        evolution_status: 'COMPLETED'
      };

      const failure1: Trajectory = {
        task_id: 'traj-failure-001',
        session_id: 'session-test',
        user_input: '失败案例1',
        steps: [],
        final_result: 'failure',
        outcome: 'FAILURE',
        environment_feedback: 'failure',
        used_rule_ids: [],
        timestamp: Date.now(),
        duration_ms: 100,
        evolution_status: 'FAILED'
      };

      await trajectoryStore.saveBatch([success1, success2, failure1]);

      const recentSuccess = await trajectoryStore.getRecentSuccess(10);
      const recentFailures = await trajectoryStore.getRecentFailures(10);

      expect(recentSuccess.length).toBeGreaterThanOrEqual(2);
      expect(recentFailures.length).toBeGreaterThanOrEqual(1);
      expect(recentSuccess.every(t => t.outcome === 'SUCCESS')).toBe(true);
      expect(recentFailures.every(t => t.outcome === 'FAILURE')).toBe(true);
    });
  });
});
