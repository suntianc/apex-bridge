# ChatService依赖精简规范

## 变更类型
`REMOVED`

## 变更范围
- 模块：`src/services/ChatService.ts`
- 模块：`src/server.ts`

## 目标
完全移除ChatService中对PersonalityEngine、EmotionEngine、MemoryService的依赖，简化服务层。

## REMOVED Requirements

- **REQ-CHAT-001**: 移除PersonalityEngine - 不再包含personalityEngine属性和setPersonalityEngine()方法
- **REQ-CHAT-002**: 移除EmotionEngine - 不再包含emotionEngine属性和setEmotionEngine()方法
- **REQ-CHAT-003**: 移除MemoryService - 不再包含memoryService、semanticMemoryService、episodicMemoryService、promptBuilder属性和setMemoryService()方法
- **REQ-CHAT-004**: 移除server.ts中的注入代码 - 不再初始化PersonalityEngine、EmotionEngine、MemoryService

## MODIFIED Requirements

### REQ-CHAT-005: 简化createChatCompletion方法
**Given** ChatService.createChatCompletion()
**When** 构建系统提示
**Then** 不再使用PersonalityEngine构建人格化提示
**And** 不再使用EmotionEngine构建情感化提示
**And** 不再自动使用MemoryService进行RAG检索
**And** 使用简单的默认系统提示

**RAG使用方式变更**:
- ❌ 不再自动：ChatService不再自动调用MemoryService进行RAG检索并注入到系统提示
- ✅ 仍可通过变量：用户可以在消息中使用 `{{rag:query}}` 变量，RAGProvider会自动检索
- ✅ 仍可通过Skills：Skills可以通过context访问RAGService进行检索

#### Scenario: 对话请求处理
```
Given 用户发送对话请求
When ChatService.processMessage()
Then 不使用PersonalityEngine
And 不使用EmotionEngine
And 不使用MemoryService
And 直接调用LLMManager
And 返回响应
```

#### Scenario: RAG通过变量使用
```
Given 用户消息包含 {{rag:什么是ABP协议}}
When 解析变量
Then RAGProvider调用RAGService进行检索
And 变量被替换为检索结果
And ChatService正常处理消息
```

#### Scenario: RAG能力保留验证
```
Given 系统启动
When 检查RAGService状态
Then ProtocolEngine.ragService存在
And RAGProvider已注册
And 向量检索功能正常
And 仅ChatService不再自动使用RAG
```

