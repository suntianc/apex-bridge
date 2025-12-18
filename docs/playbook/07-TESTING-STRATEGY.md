# Playbook 系统架构改造 - 测试策略

## 文档信息
- **文档版本**: v1.0.0
- **创建日期**: 2025-12-18
- **作者**: 测试团队
- **状态**: 待评审

## 1. 测试概览

### 1.1 测试目标
确保 Playbook 系统改造后的功能性、可靠性、性能和用户体验达到预期标准。

### 1.2 测试原则
- **全面覆盖**: 单元、集成、端到端全层级测试
- **自动化优先**: 减少人工测试，提高效率
- **性能导向**: 重点关注性能回归
- **用户体验**: 确保新功能对用户友好

### 1.3 测试范围

#### 测试对象
- ✅ TypeInductionEngine - 类型归纳引擎
- ✅ PlaybookTemplateManager - 模板管理器
- ✅ PlaybookInjector - 提示词注入器
- ✅ PlaybookMatcher (重写) - 匹配算法
- ✅ ReActStrategy (改造) - 策略集成
- ✅ 数据模型和迁移

#### 测试类型
| 测试类型 | 覆盖模块 | 目标覆盖率 |
|----------|----------|------------|
| 单元测试 | 所有核心组件 | ≥ 90% |
| 集成测试 | 服务间交互 | ≥ 80% |
| 端到端测试 | 完整用户流程 | 核心场景 100% |
| 性能测试 | 匹配、注入、归纳 | 关键路径覆盖 |
| 兼容性测试 | 向后兼容性 | 100% 覆盖 |

### 1.4 测试环境

#### 环境配置
```
┌─────────────────────────────────────────┐
│ 开发环境 (Dev)                          │
│ - 本地开发                              │
│ - 热重载                                │
│ - 单元测试                              │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ 测试环境 (Test)                         │
│ - CI/CD 流水线                          │
│ - 集成测试                              │
│ - 性能测试                              │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ 预发布环境 (Staging)                    │
│ - 接近生产环境                          │
│ - 端到端测试                            │
│ - A/B 测试                              │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ 生产环境 (Prod)                         │
│ - 灰度发布                              │
│ - 监控告警                              │
│ - 真实用户                              │
└─────────────────────────────────────────┘
```

## 2. 单元测试

### 2.1 TypeInductionEngine 测试

#### 测试文件
```typescript
// tests/unit/core/playbook/TypeInductionEngine.test.ts

describe('TypeInductionEngine', () => {
  let engine: TypeInductionEngine;
  let mockLLMManager: jest.Mocked<LLMManager>;
  let mockTypeVocabularyService: jest.Mocked<TypeVocabularyService>;
  let mockSimilarityService: jest.Mocked<SimilarityService>;

  beforeEach(() => {
    mockLLMManager = createMockLLMManager();
    mockTypeVocabularyService = createMockTypeVocabularyService();
    mockSimilarityService = createMockSimilarityService();

    engine = new TypeInductionEngine(
      {
        min_samples: 3,
        min_similarity: 0.7,
        confidence_threshold: 0.8
      },
      mockLLMManager,
      mockTypeVocabularyService,
      mockSimilarityService
    );
  });

  describe('induceTypes', () => {
    it('应该能从相似 Playbook 归纳出新类型', async () => {
      // 准备测试数据
      const mockPlaybooks = createMockPlaybooks([
        { name: '快速迭代产品开发', description: '敏捷开发流程' },
        { name: '迭代优化算法', description: '持续改进' },
        { name: '快速迭代实验', description: '快速验证假设' }
      ]);

      mockLLMManager.chat.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              name: '快速迭代',
              keywords: ['快速', '迭代', '敏捷'],
              confidence: 0.95,
              rationale: '从多个相似任务中归纳'
            })
          }
        }]
      });

      // 执行测试
      const result = await engine.induceTypes('historical', {
        min_samples: 3
      });

      // 断言
      expect(result.induced_types).toHaveLength(1);
      expect(result.induced_types[0].tag_name).toBe('rapid_iteration');
      expect(result.induced_types[0].confidence).toBeGreaterThan(0.8);
      expect(result.induced_types[0].sample_count).toBe(3);
    });

    it('应该忽略样本数不足的簇', async () => {
      const mockPlaybooks = createMockPlaybooks([
        { name: '任务1', description: '描述1' },
        { name: '任务2', description: '描述2' }
        // 只有 2 个样本，低于 min_samples=3
      ]);

      const result = await engine.induceTypes('historical');

      expect(result.induced_types).toHaveLength(0);
    });

    it('应该合并高相似度的标签', async () => {
      mockTypeVocabularyService.getAllTags.mockResolvedValue([
        { tag_name: 'agile_execution', confidence: 0.6 },
        { tag_name: 'rapid_iteration', confidence: 0.9 }
      ]);

      mockSimilarityService.calculateSimilarity
        .mockResolvedValueOnce(0.85)  // 高相似度

      const result = await engine.induceTypes('historical');

      expect(result.merged_types).toContain('agile_execution');
    });
  });

  describe('clusterPlaybooks', () => {
    it('应该正确聚类相似 Playbook', async () => {
      const features = [
        createFeature('pb1', ['快速', '迭代'], ['git', 'docker']),
        createFeature('pb2', ['快速', '迭代'], ['git', 'docker']),
        createFeature('pb3', ['数据', '分析'], ['sql', 'python'])
      ];

      const clusters = await engine.clusterPlaybooks(features, {
        min_samples: 2,
        min_similarity: 0.6
      });

      expect(clusters).toHaveLength(1);
      expect(clusters[0].playbooks).toHaveLength(2);
    });
  });
});
```

#### 测试用例清单

| 用例编号 | 用例名称 | 预期结果 | 优先级 |
|----------|----------|----------|--------|
| TC-001 | 诱导新类型-正常场景 | 成功诱导 1-3 个类型 | 高 |
| TC-002 | 诱导新类型-样本不足 | 返回空结果 | 高 |
| TC-003 | 诱导新类型-低置信度 | 过滤低置信度结果 | 高 |
| TC-004 | 聚类-相似 Playbook | 正确聚类 | 高 |
| TC-005 | 聚类-不同类型 | 返回多个簇 | 中 |
| TC-006 | 评估现有类型-合并 | 合并高相似度标签 | 中 |
| TC-007 | 评估现有类型-衰退 | 标记衰退标签 | 中 |

### 2.2 PlaybookMatcher 测试

#### 测试文件
```typescript
// tests/unit/services/PlaybookMatcher.test.ts

describe('PlaybookMatcher', () => {
  let matcher: PlaybookMatcher;
  let mockToolRetrievalService: jest.Mocked<ToolRetrievalService>;
  let mockLLMManager: jest.Mocked<LLMManager>;
  let mockTypeVocabularyService: jest.Mocked<TypeVocabularyService>;
  let mockSimilarityService: jest.Mocked<SimilarityService>;

  beforeEach(() => {
    mockToolRetrievalService = createMockToolRetrievalService();
    mockLLMManager = createMockLLMManager();
    mockTypeVocabularyService = createMockTypeVocabularyService();
    mockSimilarityService = createMockSimilarityService();

    matcher = new PlaybookMatcher(
      mockToolRetrievalService,
      mockLLMManager,
      mockTypeVocabularyService,
      mockSimilarityService
    );
  });

  describe('matchPlaybooksDynamic', () => {
    it('应该基于动态类型匹配 Playbook', async () => {
      const context: MatchingContext = {
        userQuery: '如何快速迭代产品？'
      };

      mockTypeVocabularyService.getAllTags.mockResolvedValue([
        { tag_name: 'rapid_iteration', keywords: ['快速', '迭代'] }
      ]);

      mockTypeVocabularyService.getPlaybooksByTags.mockResolvedValue([
        { playbook: createPlaybook('pb1', ['rapid_iteration']) }
      ]);

      const matches = await matcher.matchPlaybooksDynamic(contextatches).toHave);

      expect(mLength(1);
      expect(matches[0].playbook.type_tags).toContain('rapid_iteration');
    });

    it('应该计算多标签匹配分数', async () => {
      const playbook = createPlaybook('pb1', ['rapid_iteration', 'data_driven']);
      playbook.type_confidence = {
        rapid_iteration: 0.92,
        data_driven: 0.88
      };

      const context: MatchingContext = {
        userQuery: '快速迭代和数据驱动'
      };

      mockTypeVocabularyService.getAllTags.mockResolvedValue([
        { tag_name: 'rapid_iteration', keywords: ['快速', '迭代'] },
        { tag_name: 'data_driven', keywords: ['数据', '驱动'] }
      ]);

      const matches = await matcher.matchPlaybooksDynamic(context);

      expect(matches[0].matchScore).toBeGreaterThan(0.8);
      expect(matches[0].tagScores).toHaveLength(2);
    });

    it('应该支持标签相似度匹配', async () => {
      mockSimilarityService.getSimilarTags.mockResolvedValue([
        {
          tag1: 'rapid_iteration',
          tag2: 'agile_execution',
          similarity_score: 0.85
        }
      ]);

      const context: MatchingContext = {
        userQuery: '敏捷开发'
      };

      const matches = await matcher.matchPlaybooksDynamic(context);

      // 应该找到与 agile_execution 相似的 rapid_iteration
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  describe('calculateMultiTagMatchScore', () => {
    it('应该正确计算完全匹配分数', async () => {
      const playbook = createPlaybook('pb1', ['rapid_iteration']);
      const typeSignals = new Map([['rapid_iteration', 0.9]]);

      const score = await matcher.calculateMultiTagMatchScore(
        playbook,
        { userQuery: '快速迭代' },
        typeSignals
      );

      expect(score.matchScore).toBeGreaterThan(0.7);
      expect(score.matchReasons).toContain('标签 "rapid_iteration" 完全匹配');
    });

    it('应该正确计算语义相似度分数', async () => {
      const playbook = createPlaybook('pb1', ['agile_execution']);
      const typeSignals = new Map([['rapid_iteration', 0.8]]);

      mockSimilarityService.calculateSimilarity
        .mockResolvedValueOnce(0.85);

      const score = await matcher.calculateMultiTagMatchScore(
        playbook,
        { userQuery: '快速迭代' },
        typeSignals
      );

      expect(score.matchReasons).toContain('标签 "agile_execution" 语义相似');
    });
  });
});
```

### 2.3 PlaybookTemplateManager 测试

#### 测试文件
```typescript
// tests/unit/core/playbook/PlaybookTemplateManager.test.ts

describe('PlaybookTemplateManager', () => {
  let manager: PlaybookTemplateManager;
  let mockPromptTemplateService: jest.Mocked<PromptTemplateService>;
  let mockVariableEngine: jest.Mocked<VariableEngine>;
  let mockLLMManager: jest.Mocked<LLMManager>;

  beforeEach(() => {
    mockPromptTemplateService = createMockPromptTemplateService();
    mockVariableEngine = createMockVariableEngine();
    mockLLMManager = createMockLLMManager();

    manager = new PlaybookTemplateManager(
      mockPromptTemplateService,
      mockVariableEngine,
      mockLLMManager
    );
  });

  describe('renderTemplate', () => {
    it('应该正确渲染模板', async () => {
      const template = createTemplate('rapid_iteration_guidance', {
        content: '【目标】{goal}\n【步骤】{steps}',
        variables: ['goal', 'steps']
      });

      mockPromptTemplateService.getTemplate.mockResolvedValue(template);
      mockVariableEngine.resolveVariables.mockResolvedValue({
        goal: '快速验证假设',
        steps: '1. 明确问题\n2. 设计实验'
      });

      const result = await manager.renderTemplate(
        'rapid_iteration_guidance',
        createPlaybook('pb1'),
        { variables: {} }
      );

      expect(result.content).toContain('快速验证假设');
      expect(result.content).toContain('明确问题');
      expect(result.variables_used).toEqual(['goal', 'steps']);
    });

    it('应该控制模板长度', async () => {
      const template = createTemplate('long_template', {
        content: 'A'.repeat(1000),
        variables: []
      });

      mockPromptTemplateService.getTemplate.mockResolvedValue(template);

      const result = await manager.renderTemplate(
        'long_template',
        createPlaybook('pb1'),
        { max_length: 500 }
      );

      expect(result.content.length).toBeLessThanOrEqual(500);
      expect(result.truncated).toBe(true);
    });
  });

  describe('selectBestTemplate', () => {
    it('应该选择效果最佳的模板', async () => {
      const templates = [
        createTemplate('t1', { effectiveness_score: 0.8 }),
        createTemplate('t2', { effectiveness_score: 0.9 })
      ];

      mockPromptTemplateService.getTemplatesByTags.mockResolvedValue(templates);

      const selected = await manager.selectBestTemplate(
        createPlaybook('pb1', ['rapid_iteration']),
        { userQuery: '测试' }
      );

      expect(selected.template_id).toBe('t2'); // 效果更好的模板
    });

    it('应该根据指导强度筛选模板', async () => {
      const templates = [
        createTemplate('light', { guidance_level: 'light' }),
        createTemplate('medium', { guidance_level: 'medium' })
      ];

      mockPromptTemplateService.getTemplatesByTags.mockResolvedValue(templates);

      const selected = await manager.selectBestTemplate(
        createPlaybook('pb1'),
        { userQuery: '测试' },
        { guidance_level: 'medium' }
      );

      expect(selected.guidance_level).toBe('medium');
    });
  });
});
```

### 2.4 单元测试覆盖率要求

```typescript
// jest.config.js
module.exports = {
  collectCoverageFrom: [
    'src/core/playbook/**/*.{ts,tsx}',
    'src/services/**/*.{ts,tsx}',
    'src/strategies/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './src/core/playbook/TypeInductionEngine.ts': {
      branches: 85,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/services/PlaybookMatcher.ts': {
      branches: 85,
      functions: 95,
      lines: 95,
      statements: 95
    }
  }
};
```

## 3. 集成测试

### 3.1 服务间集成测试

#### 测试文件
```typescript
// tests/integration/playbook/system.test.ts

describe('Playbook System Integration', () => {
  let app: Express;
  let testDB: Database;

  beforeAll(async () => {
    app = createTestApp();
    testDB = await createTestDatabase();
  });

  afterAll(async () => {
    await testDB.close();
  });

  describe('类型归纳完整流程', () => {
    it('应该完整执行类型归纳 → 存储 → 查询流程', async () => {
      // 1. 准备测试数据
      await seedPlaybooks(testDB, 50);

      // 2. 触发类型归纳
      const response = await request(app)
        .post('/api/playbook/types/induce')
        .send({ source: 'historical' })
        .expect(202);

      const taskId = response.body.task_id;

      // 3. 等待完成
      await waitFor(() =>
        request(app)
          .get(`/api/playbook/types/induce/${taskId}`)
          .expect(200)
          .then(res => res.body.status === 'completed')
      );

      // 4. 验证结果
      const vocabResponse = await request(app)
        .get('/api/playbook/types/vocabulary')
        .expect(200);

      expect(vocabResponse.body.items).toHaveLength(
        expect.arrayContaining([expect.objectContaining({ tag_name: expect.any(String) })])
      );
    });
  });

  describe('Playbook 匹配 → 注入完整流程', () => {
    it('应该完整执行匹配 → 模板选择 → 注入流程', async () => {
      // 1. 准备测试数据
      await seedPlaybooks(testDB, 10);
      await seedTemplates(testDB, 3);

      // 2. 触发匹配
      const matchResponse = await request(app)
        .post('/api/playbook/match')
        .send({
          query: '如何快速迭代产品？',
          options: {
            max_recommendations: 5,
            min_match_score: 0.6
          }
        })
        .expect(200);

      expect(matchResponse.body.matches).toHaveLength(1);
      const matchedPlaybook = matchResponse.body.matches[0];

      // 3. 验证匹配分数
      expect(matchedPlaybook.matchScore).toBeGreaterThan(0.6);
      expect(matchedPlaybook.playbook.type_tags).toBeDefined();

      // 4. 验证模板注入
      const playbook = matchedPlaybook.playbook;
      expect(playbook.prompt_template_id).toBeDefined();
    });
  });

  describe('ReAct 策略集成', () => {
    it('应该在 prepare() 阶段正确注入 Playbook 指导', async () => {
      // 1. 准备测试数据
      await seedPlaybooks(testDB, 5);

      // 2. 模拟聊天请求
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: '如何快速迭代？' }],
          playbook_options: {
            enabled: true,
            guidance_level: 'medium'
          }
        })
        .expect(200);

      // 3. 验证响应包含 Playbook 元数据
      expect(response.body.playbook_metadata).toBeDefined();
      expect(response.body.playbook_metadata.guidance_applied).toBe(true);
      expect(response.body.playbook_metadata.playbook_name).toBeDefined();
    });
  });

  describe('数据迁移验证', () => {
    it('应该正确迁移现有 Playbook 数据', async () => {
      // 1. 插入旧格式数据
      await testDB.execute(`
        INSERT INTO strategic_playbook (id, name, type, description)
        VALUES ('pb_old_1', '旧版 Playbook', 'problem_solving', '测试描述')
      `);

      // 2. 执行迁移
      await runMigration(testDB);

      // 3. 验证迁移结果
      const result = await testDB.query(`
        SELECT type_tags, type_confidence
        FROM strategic_playbook
        WHERE id = 'pb_old_1'
      `);

      expect(result[0].type_tags).toBeDefined();
      expect(JSON.parse(result[0].type_tags)).toEqual(['problem_solving']);
      expect(result[0].type_confidence).toBeDefined();
    });
  });
});
```

### 3.2 数据库集成测试

```typescript
// tests/integration/database/type-vocabulary.test.ts

describe('TypeVocabulary Integration', () => {
  let testDB: Database;

  beforeAll(async () => {
    testDB = await createTestDatabase();
    await runMigrations(testDB);
  });

  afterAll(async () => {
    await testDB.close();
  });

  it('应该正确创建和查询类型标签', async () => {
    const service = new TypeVocabularyService(testDB);

    // 创建标签
    await service.createTag({
      tag_name: 'test_type',
      keywords: ['测试', '类型'],
      confidence: 0.9,
      first_identified: Date.now(),
      playbook_count: 5,
      discovered_from: 'manual_creation',
      metadata: { description: '测试类型' }
    });

    // 查询标签
    const tags = await service.getAllTags();
    expect(tags).toContainEqual(
      expect.objectContaining({ tag_name: 'test_type' })
    );

    // 更新置信度
    await service.updateConfidence('test_type', 0.95);
    const updated = await service.getTag('test_type');
    expect(updated.confidence).toBe(0.95);
  });

  it('应该正确处理类型相似度', async () => {
    const similarityService = new SimilarityService(testDB);

    // 模拟相似度计算
    const similarity = await similarityService.calculateSimilarity(
      'rapid_iteration',
      'agile_execution'
    );

    expect(similarity).toBeGreaterThanOrEqual(0);
    expect(similarity).toBeLessThanOrEqual(1);
  });
});
```

## 4. 端到端测试

### 4.1 用户场景测试

#### 测试文件
```typescript
// tests/e2e/user-scenarios.test.ts

describe('User Scenarios', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
  });

  describe('场景 1: 用户咨询快速迭代问题', () => {
    it('应该自动匹配并注入快速迭代指导', async () => {
      // 1. 打开聊天界面
      await page.goto('http://localhost:3000/chat');

      // 2. 发送消息
      await page.fill('textarea[placeholder="输入消息..."]', '如何快速迭代产品开发？');
      await page.click('button:has-text("发送")');

      // 3. 等待响应
      await page.waitForSelector('.message.assistant');

      // 4. 验证响应内容
      const response = await page.textContent('.message.assistant');
      expect(response).toMatch(/快速迭代|迭代|敏捷/);

      // 5. 验证 Playbook 元数据显示
      const metadata = await page.getAttribute('.playbook-badge', 'data-metadata');
      expect(metadata).toContain('rapid_iteration');
    });
  });

  describe('场景 2: 用户查看匹配到的 Playbook', () => {
    it('应该显示匹配的 Playbook 信息', async () => {
      await page.goto('http://localhost:3000/playbooks');

      // 筛选快速迭代类型
      await page.click('button:has-text("快速迭代")');

      // 验证 Playbook 列表
      const playbooks = await page.$$eval('.playbook-card', cards =>
        cards.map(card => ({
          name: card.querySelector('.playbook-name')?.textContent,
          tags: Array.from(card.querySelectorAll('.tag')).map(tag => tag.textContent)
        }))
      );

      expect(playbooks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tags: expect.arrayContaining(['rapid_iteration'])
          })
        ])
      );
    });
  });

  describe('场景 3: 管理员触发类型归纳', () => {
    it('应该成功触发并显示归纳结果', async () => {
      // 登录管理员账号
      await page.goto('http://localhost:3000/admin/login');
      await page.fill('#username', 'admin');
      await page.fill('#password', 'admin');
      await page.click('button:has-text("登录")');

      // 导航到类型管理
      await page.click('a:has-text("类型管理")');

      // 触发归纳
      await page.click('button:has-text("触发类型归纳")');

      // 等待任务完成
      await page.waitForSelector('.toast:has-text("类型归纳完成")', { timeout: 60000 });

      // 验证新类型出现
      const newTypes = await page.$$eval('.type-card.new', cards =>
        cards.map(card => card.querySelector('.type-name')?.textContent)
      );

      expect(newTypes.length).toBeGreaterThan(0);
    });
  });
});
```

### 4.2 API 端到端测试

```typescript
// tests/e2e/api/chat-completions.test.ts

describe('Chat Completions API E2E', () => {
  const api = request('http://localhost:3000');

  describe('POST /v1/chat/completions', () => {
    it('应该返回带有 Playbook 指导的响应', async () => {
      const response = await api
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: '如何快速迭代验证产品假设？' }
          ],
          playbook_options: {
            enabled: true,
            guidance_level: 'medium'
          }
        })
        .expect(200);

      expect(response.body.choices[0].message.content).toBeDefined();
      expect(response.body.playbook_metadata).toEqual(
        expect.objectContaining({
          guidance_applied: true,
          playbook_name: expect.any(String),
          playbook_tags: expect.arrayContaining(['rapid_iteration'])
        })
      );
    });

    it('应该在未匹配到 Playbook 时正常响应', async () => {
      const response = await api
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [
            { role: 'user', content: '今天天气怎么样？' } // 不相关查询
          ],
          playbook_options: {
            enabled: true
          }
        })
        .expect(200);

      expect(response.body.choices[0].message.content).toBeDefined();
      expect(response.body.playbook_metadata.guidance_applied).toBe(false);
    });

    it('应该支持流式响应', async () => {
      const response = await api
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-4',
          messages: [{ role: 'user', content: '快速迭代的好处是什么？' }],
          stream: true
        })
        .expect(200);

      const chunks = response.text.split('\n').filter(line => line.startsWith('data:'));

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toContain('data: {');
    });
  });
});
```

## 5. 性能测试

### 5.1 负载测试

#### 测试脚本
```typescript
// tests/performance/load-test.ts

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // 渐进到 100 用户
    { duration: '5m', target: 100 },  // 保持 100 用户
    { duration: '2m', target: 200 },  // 渐进到 200 用户
    { duration: '5m', target: 200 },  // 保持 200 用户
    { duration: '2m', target: 0 }     // 渐退
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% 请求 < 500ms
    http_req_failed: ['rate<0.01'],     // 错误率 < 1%
  }
};

export default function() {
  // 测试 Playbook 匹配性能
  const payload = JSON.stringify({
    query: '如何快速迭代产品？',
    context: {
      sessionHistory: []
    },
    options: {
      max_recommendations: 5,
      min_match_score: 0.6
    }
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token'
    }
  };

  const response = http.post(
    'http://localhost:3000/api/playbook/match',
    payload,
    params
  );

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
    'has matches': (r) => {
      const body = JSON.parse(r.body);
      return body.matches && body.matches.length > 0;
    }
  });

  sleep(1);
}
```

#### 运行负载测试
```bash
# 安装 K6
brew install k6  # macOS
# 或参考 https://k6.io/docs/getting-started/installation/

# 运行测试
k6 run tests/performance/load-test.js

# 生成报告
k6 run --out json=results.json tests/performance/load-test.js
```

### 5.2 基准测试

```typescript
// tests/performance/benchmark.ts

interface BenchmarkResult {
  name: string;
  iterations: number;
  avgTime: number;
  p50: number;
  p95: number;
  p99: number;
}

class PerformanceBenchmark {
  async runBenchmarks(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // 1. 类型归纳性能
    results.push(await this.benchmarkTypeInduction());

    // 2. Playbook 匹配性能
    results.push(await this.benchmarkPlaybookMatching());

    // 3. 提示词注入性能
    results.push(await this.benchmarkPromptInjection());

    // 4. 数据库查询性能
    results.push(await this.benchmarkDatabaseQueries());

    return results;
  }

  private async benchmarkTypeInduction(): Promise<BenchmarkResult> {
    const iterations = 100;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await typeInductionEngine.induceTypes('batch', {
        min_samples: 5
      });
      times.push(performance.now() - start);
    }

    return this.calculateStats('TypeInduction', iterations, times);
  }

  private async benchmarkPlaybookMatching(): Promise<BenchmarkResult> {
    const iterations = 1000;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await playbookMatcher.matchPlaybooksDynamic({
        userQuery: '如何快速迭代？',
        sessionHistory: []
      });
      times.push(performance.now() - start);
    }

    return this.calculateStats('PlaybookMatching', iterations, times);
  }

  private calculateStats(name: string, iterations: number, times: number[]): BenchmarkResult {
    const sorted = times.sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);

    return {
      name,
      iterations,
      avgTime: sum / times.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
}

// 运行基准测试
const benchmark = new PerformanceBenchmark();
benchmark.runBenchmarks().then(results => {
  console.table(results);
});
```

### 5.3 性能基准指标

| 测试项目 | 目标值 | P50 | P95 | P99 |
|----------|--------|-----|-----|-----|
| 类型归纳 (1000 Playbook) | < 5s | 3s | 4s | 5s |
| Playbook 匹配 | < 100ms | 50ms | 80ms | 100ms |
| 提示词注入 | < 50ms | 20ms | 40ms | 50ms |
| 数据库查询 | < 10ms | 5ms | 8ms | 10ms |
| LLM 响应时间 | < 2s | 1s | 1.5s | 2s |

## 6. 兼容性测试

### 6.1 向后兼容性测试

```typescript
// tests/compatibility/backward-compatibility.test.ts

describe('Backward Compatibility', () => {
  it('应该兼容旧的 type 字段', async () => {
    // 插入旧格式数据
    const oldPlaybook = {
      id: 'pb_old',
      name: '旧版 Playbook',
      type: 'problem_solving',
      description: '测试'
    };

    // 查询时应该能获取到 type
    const retrieved = await playbookManager.getPlaybook('pb_old');
    expect(retrieved.type).toBe('problem_solving');

    // 新字段也应该存在
    expect(retrieved.type_tags).toEqual(['problem_solving']);
  });

  it('应该兼容旧的强制执行 API', async () => {
    const plan = createTestPlan();
    const context = createTestContext();

    // 调用已废弃的方法
    const result = await playbookExecutor.executePlan(plan, context);

    // 应该返回降级响应
    expect(result.success).toBe(false);
    expect(result.reason).toBe('deprecated');
  });

  it('应该兼容旧的 Playbook 格式', async () => {
    const playbook = {
      id: 'pb_compat',
      name: '兼容性测试',
      actions: [  // 旧字段
        { step: 1, description: '步骤1' }
      ]
    };

    const updated = await playbookManager.updatePlaybook('pb_compat', playbook);

    // 新旧字段都应该保留
    expect(updated.actions).toBeDefined();
    expect(updated.guidance_steps).toBeDefined();
  });
});
```

### 6.2 API 版本兼容性

```typescript
// tests/compatibility/api-versioning.test.ts

describe('API Versioning', () => {
  it('应该支持 v1 API', async () => {
    const response = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'gpt-4',
        messages: [{ role: 'user', content: '测试' }]
      })
      .expect(200);

    // v1 应该不包含新字段
    expect(response.body.playbook_metadata).toBeUndefined();
  });

  it('应该支持 v2 API', async () => {
    const response = await request(app)
      .post('/v2/chat/completions')
      .set('Accept', 'application/vnd.apexbridge.v2+json')
      .send({
        model: 'gpt-4',
        messages: [{ role: 'user', content: '测试' }],
        playbook_options: { enabled: true }
      })
      .expect(200);

    // v2 应该包含新字段
    expect(response.body.playbook_metadata).toBeDefined();
  });
});
```

## 7. 安全测试

### 7.1 输入验证测试

```typescript
// tests/security/input-validation.test.ts

describe('Input Validation', () => {
  it('应该防止 SQL 注入', async () => {
    const maliciousQuery = "'; DROP TABLE strategic_playbook; --";

    const response = await request(app)
      .post('/api/playbook/search')
      .send({ query: maliciousQuery })
      .expect(200);

    // 表应该仍然存在
    const count = await db.query('SELECT COUNT(*) FROM strategic_playbook');
    expect(count).toBeGreaterThan(0);
  });

  it('应该防止 XSS 攻击', async () => {
    const xssPayload = '<script>alert("xss")</script>';

    const response = await request(app)
      .post('/api/playbook/match')
      .send({
        query: xssPayload,
        context: {}
      })
      .expect(200);

    // 响应中不应该包含原始脚本
    expect(response.body).not.toContain('<script>');
  });

  it('应该限制查询长度', async () => {
    const longQuery = 'a'.repeat(10000);

    const response = await request(app)
      .post('/api/playbook/match')
      .send({
        query: longQuery,
        context: {}
      })
      .expect(400);

    expect(response.body.error.code).toBe('QUERY_TOO_LONG');
  });
});
```

### 7.2 权限测试

```typescript
// tests/security/authorization.test.ts

describe('Authorization', () => {
  it('应该要求认证才能访问管理接口', async () => {
    await request(app)
      .post('/api/playbook/types/induce')
      .send({ source: 'manual' })
      .expect(401);
  });

  it('应该验证用户权限', async () => {
    const userToken = 'user-token-not-admin';

    await request(app)
      .post('/api/playbook/types/induce')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ source: 'manual' })
      .expect(403);
  });

  it('应该限制 API 速率', async () => {
    const promises = Array(100).fill(0).map(() =>
      request(app)
        .post('/api/playbook/match')
        .send({ query: 'test' })
    );

    const responses = await Promise.all(promises);
    const rateLimited = responses.filter(r => r.status === 429);

    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
```

## 8. 混沌测试

### 8.1 故障注入测试

```typescript
// tests/chaos/failure-injection.test.ts

describe('Chaos Testing', () => {
  it('应该在数据库连接失败时优雅降级', async () => {
    // 模拟数据库连接失败
    await simulateDatabaseFailure();

    const response = await request(app)
      .post('/api/playbook/match')
      .send({ query: 'test' })
      .expect(200);

    // 应该返回空结果而不是错误
    expect(response.body.matches).toEqual([]);
  });

  it('应该在 LLM 服务不可用时回退', async () => {
    // 模拟 LLM 服务故障
    await simulateLLMFailure();

    const response = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'gpt-4',
        messages: [{ role: 'user', content: '测试' }]
      })
      .expect(200);

    // 应该返回基本响应
    expect(response.body.choices[0].message.content).toBeDefined();
  });

  it('应该在内存不足时启用缓存降级', async () => {
    // 模拟内存压力
    await simulateMemoryPressure();

    const start = performance.now();
    await playbookMatcher.matchPlaybooksDynamic(testContext);
    const duration = performance.now() - start;

    // 应该仍能工作，但可能更慢
    expect(duration).toBeLessThan(1000);
  });
});
```

## 9. 测试工具和配置

### 9.1 Jest 配置

```typescript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testMatch: [
    '**/tests/**/*.test.{ts,tsx}',
    '**/__tests__/**/*.{ts,tsx}'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
```

### 9.2 测试数据工厂

```typescript
// tests/utils/factories.ts

export function createMockPlaybook(overrides: Partial<StrategicPlaybook> = {}): StrategicPlaybook {
  return {
    id: 'pb_' + Math.random().toString(36).substr(2, 9),
    name: '测试 Playbook',
    description: '测试描述',
    type: 'problem_solving',
    type_tags: ['test_type'],
    type_confidence: { test_type: 0.9 },
    version: '1.0.0',
    status: 'active',
    context: {
      domain: '测试',
      scenario: '测试场景',
      complexity: 'medium',
      stakeholders: []
    },
    actions: [],
    createdAt: Date.now(),
    lastUpdated: Date.now(),
    metrics: {
      successRate: 0.8,
      usageCount: 10,
      averageOutcome: 7,
      lastUsed: Date.now(),
      timeToResolution: 300000,
      userSatisfaction: 8
    },
    tags: ['test'],
    ...overrides
  };
}

export function createMockTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    template_id: 'template_' + Math.random().toString(36).substr(2, 9),
    template_type: 'guidance',
    name: '测试模板',
    content: '测试内容 {variable}',
    variables: ['variable'],
    applicable_tags: ['test'],
    guidance_level: 'medium',
    created_at: Date.now(),
    updated_at: Date.now(),
    usage_count: 0,
    ...overrides
  };
}
```

### 9.3 测试报告

```typescript
// scripts/generate-test-report.ts

import { runCLI } from '@jest/reporters';

async function generateTestReport() {
  const { results } = await runCLI(
    {
      config: 'jest.config.js',
      coverage: true,
      runInBand: true
    } as any,
    ['./']
  );

  const report = {
    summary: {
      totalTests: results.numTotalTests,
      passedTests: results.numPassedTests,
      failedTests: results.numFailedTests,
      skippedTests: results.numPendingTests,
      coverage: results.coverageMap
    },
    suites: results.testResults.map(suite => ({
      name: suite.name,
      status: suite.status,
      tests: suite.assertionResults.map(test => ({
        name: test.title,
        status: test.status,
        duration: test.duration
      }))
    }))
  };

  console.log(JSON.stringify(report, null, 2));
}
```

## 10. 测试执行计划

### 10.1 CI/CD 流水线

```yaml
# .github/workflows/test.yml

name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage

  integration-tests:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm run start:test &
      - run: npm run test:e2e

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:performance
      - run: k6 run tests/performance/load-test.js
```

### 10.2 测试执行时间表

| 测试类型 | 执行频率 | 执行时间 | 资源需求 |
|----------|----------|----------|----------|
| 单元测试 | 每次提交 | 2-5 分钟 | 1 CPU |
| 集成测试 | 每次 PR | 5-10 分钟 | 2 CPU + 内存 |
| 端到端测试 | 每日构建 | 10-15 分钟 | 4 CPU + 浏览器 |
| 性能测试 | 每周 | 30-60 分钟 | 8 CPU |
| 混沌测试 | 每月 | 60-120 分钟 | 专用环境 |

### 10.3 测试成功标准

| 测试类型 | 通过率要求 | 覆盖率要求 | 性能要求 |
|----------|------------|------------|----------|
| 单元测试 | 100% | 行 ≥ 90% | < 5s |
| 集成测试 | 100% | 场景覆盖 100% | < 10s |
| 端到端测试 | 100% | 核心流程 100% | < 30s |
| 性能测试 | N/A | 关键路径覆盖 | 达标 |
| 兼容性测试 | 100% | 向后兼容 100% | N/A |

---

## 总结

本测试策略提供了全面的测试方案，覆盖从单元测试到混沌测试的全方位验证。关键要点：

1. **分层测试**: 单元 → 集成 → 端到端，逐层验证
2. **自动化优先**: 减少人工测试，提高效率
3. **性能导向**: 重点关注性能回归
4. **安全第一**: 输入验证、权限控制、混沌测试
5. **持续集成**: CI/CD 流水线自动化执行

通过严格执行本测试策略，确保 Playbook 系统改造的质量和稳定性。

---

**下一步行动**: 准备开始实施，根据 `05-IMPLEMENTATION-PLAN.md` 的计划执行开发任务。
