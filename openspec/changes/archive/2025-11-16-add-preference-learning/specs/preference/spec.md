# Preference Learning (ADDED)

## Purpose
提供一阶“偏好学习”能力：结构化模型、合并策略、服务与 API、聊天管线注入点。

## Requirements (ADDED)
R1. 系统必须定义 Preference 模型（会话级/用户级/系统级默认），记录键值、来源、权重/TTL。  
R2. 系统必须对多层偏好执行确定性的合并（precedence：会话 > 用户 > 系统默认），并保留来源追踪。  
R3. 系统必须提供服务接口（get/set/merge/getView）。  
R4. 系统必须提供 API：  
- GET /api/preferences/:userId 返回合并后的视图与来源说明  
- PUT /api/preferences/:userId 写入/更新用户偏好（部分字段）  
R5. 聊天管线在生成系统提示与工具描述前必须注入合并偏好，可影响三段披露的展示策略与工具参数默认值。  
R6. 变更必须有单元与集成测试覆盖：合并逻辑、API、聊天管线生效。

## Scenarios
S1. 当用户更新“语言=中文”，下一轮系统提示应以中文呈现并在工具描述中优先展示中文。  
S2. 当会话偏好设置“工具详细度=brief”，三段披露应聚焦 brief。  
S3. 当偏好包含“默认城市=上海”，调用天气类工具时未显式传入城市应默认上海。  
S4. 当用户删除某一偏好键，合并视图应回退到较低优先级或默认值。  
S5. API 写入后立即可见于合并视图，且下一轮对话生效。

## Delta for chat-pipeline (UPDATED)
- 在“系统提示构建”与“工具描述生成”步骤之前，新增“合并偏好并注入上下文”的必经步骤。  
- 三段披露策略允许参考偏好键（如 toolsDisclosure=metadata|brief|full）。  
- 执行参数装配时，支持使用偏好键作默认值。

## Non-Goals
- 不包含个性化排序/探索策略。

## Verification
- 单测覆盖合并策略与来源追踪；集成测试覆盖 API 与对话生效路径；严格校验通过。
## ADDED Requirements

### Requirement: Preference Learning System
The system SHALL provide functionality to learn, store, and apply user preferences extracted from conversations, enabling the AI to provide more personalized responses based on learned user preferences.

#### Scenario: Extract preference from conversation
- **WHEN** a user message contains preference information (e.g., "I like sci-fi movies", "我不喜欢吃辣")
- **THEN** the system SHALL extract the preference type and value, and store it with an associated confidence score

#### Scenario: Store user preference
- **WHEN** a preference is extracted or manually added via API
- **THEN** the system SHALL store the preference in a persistent storage (JSON file or RAG), associated with the user ID, and include metadata such as preference type, value, confidence, and context

#### Scenario: Update existing preference
- **WHEN** a preference with the same type already exists for a user
- **THEN** the system SHALL update the existing preference with the new value and confidence, or merge preferences if appropriate

#### Scenario: Apply preferences in memory retrieval
- **WHEN** a memory retrieval query is made that matches stored preferences
- **THEN** the system SHALL prioritize returning memories that are relevant to the user's stored preferences

#### Scenario: List user preferences
- **WHEN** an administrator sends a GET request to `/api/admin/preferences` with a user ID
- **THEN** the system SHALL return a JSON array of all preferences for that user, including preference type, value, confidence, and metadata

#### Scenario: Create preference manually
- **WHEN** an administrator sends a POST request to `/api/admin/preferences` with a valid preference object
- **THEN** the system SHALL validate the preference data, store it, and return the created preference with a success status

#### Scenario: Update preference manually
- **WHEN** an administrator sends a PUT request to `/api/admin/preferences/:id` with updated preference data
- **THEN** the system SHALL validate the data, update the preference, and return the updated preference with a success status

#### Scenario: Delete preference
- **WHEN** an administrator sends a DELETE request to `/api/admin/preferences/:id`
- **THEN** the system SHALL delete the preference from storage and return a success status

#### Scenario: API authentication required
- **WHEN** an unauthenticated request is sent to any preference management API endpoint
- **THEN** the system SHALL return a 401 Unauthorized error with an appropriate error message

### Requirement: Preference Management Web Interface
The system SHALL provide a web-based administration interface for viewing and managing user preferences, allowing administrators to view, create, edit, and delete preferences through a user-friendly UI when the interface is implemented.

#### Scenario: View preferences list
- **WHEN** an administrator navigates to the preference management page in the admin panel
- **THEN** the system SHALL display a list of all stored preferences, showing at minimum: preference type, value, confidence, and action buttons (edit, delete)

#### Scenario: Create preference manually
- **WHEN** an administrator clicks the "Create Preference" button and fills out the preference form with valid data
- **THEN** the system SHALL submit the data to the API, display a success message upon successful creation, and update the preference list to include the new preference

#### Scenario: Edit preference
- **WHEN** an administrator clicks the "Edit" button for a preference and modifies the data in the form
- **THEN** the system SHALL load the current preference data into the form, allow modifications, submit the updated data to the API upon save, display a success message, and update the preference list with the changes

#### Scenario: Delete preference
- **WHEN** an administrator clicks the "Delete" button for a preference and confirms the deletion
- **THEN** the system SHALL send a DELETE request to the API, display a success message upon successful deletion, and remove the preference from the list

