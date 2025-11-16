## 1. 类型定义和配置
- [x] 1.1 创建`src/types/personality.ts`，定义PersonalityConfig接口和相关类型
- [x] 1.2 创建`config/personality/`目录结构

## 2. PersonalityEngine核心实现
- [x] 2.1 实现`PersonalityEngine`类（`src/core/PersonalityEngine.ts`）
- [x] 2.2 实现JSON格式配置文件加载
- [x] 2.3 实现TXT文件向后兼容解析
- [x] 2.4 实现System Prompt构建（固定模板）
- [x] 2.5 实现缓存机制（内存缓存 + 启动清除）
- [x] 2.6 实现按需加载和手动刷新功能

## 3. 集成到ChatService
- [x] 3.1 修改`ChatService.processMessage()`，在变量替换前注入人格
- [x] 3.2 修改`ChatService.streamMessage()`，支持流式对话的人格注入
- [x] 3.3 确保人格system message位于消息列表最前（优先级最高）

## 4. API集成
- [x] 4.1 修改`ChatController.chatCompletions()`，支持`agent_id`参数
- [x] 4.2 验证API调用流程（JSON和流式）
  - [x] `tests/api/ChatController.persona-routing.test.ts` 自动覆盖 JSON + SSE 流程，确保`agent_id`→人格注入
  - [x] `docs/testing/INTEGRATION_SCENARIOS.md` 新增“场景三：Hub 人格切换 API”提供 curl 步骤

## 5. 预装人格配置
- [x] 5.1 创建`config/personality/default.json`（默认人格）
- [x] 5.2 创建`config/personality/专业助手.json`
- [x] 5.3 创建`config/personality/温暖伙伴.json`
- [x] 5.4 创建`config/personality/活泼助手.json`

## 6. 测试
- [x] 6.1 编写PersonalityEngine单元测试
- [x] 6.2 测试JSON配置文件加载
- [x] 6.3 测试TXT文件向后兼容
- [x] 6.4 测试System Prompt构建
- [x] 6.5 测试多人格切换
- [x] 6.6 集成测试（验证人格在对话中生效） - 所有单元测试通过 ✅

