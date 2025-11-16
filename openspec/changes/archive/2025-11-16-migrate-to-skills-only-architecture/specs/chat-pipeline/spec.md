## MODIFIED Requirements

### Requirement: Chat Service Tool Execution

The `ChatService` SHALL use `SkillsExecutionManager` as the primary execution engine for all tool calls.

The service SHALL NOT use `PluginRuntime` for tool execution.

The service SHALL integrate with `SkillsToToolMapper` to map tool calls to Skills execution.

#### Scenario: Tool execution via ChatService
- **WHEN** `executeAllowedTool(call)` is called
- **THEN** it SHALL use `SkillsExecutionManager.executeByIntent()` instead of `PluginRuntime.executePlugin()`
- **THEN** it SHALL use `SkillsToToolMapper` to convert tool call to execution request
- **THEN** it SHALL convert execution response back to tool result format
- **THEN** it SHALL return the result in the expected format

#### Scenario: Tool execution with confidence
- **WHEN** a tool execution is requested with confidence information
- **THEN** it SHALL pass confidence to `SkillsExecutionManager`
- **THEN** it SHALL use appropriate description phase based on confidence
- **THEN** it SHALL execute the tool with full context when confidence >= 0.7

### Requirement: Message Preprocessing

The `ChatService` SHALL NOT use `PluginRuntime.processMessages()` for message preprocessing.

The service SHALL use Skills-based preprocessing if needed, or handle preprocessing internally.

#### Scenario: Message preprocessing without PluginRuntime
- **WHEN** messages need to be preprocessed
- **THEN** it SHALL NOT call `PluginRuntime.processMessages()`
- **THEN** it SHALL handle preprocessing internally or use Skills-based preprocessors
- **THEN** it SHALL maintain message format compatibility

### Requirement: Tool Description Integration

The `ChatService` SHALL support three-phase progressive disclosure for tool descriptions.

The service SHALL use `ToolDescriptionProvider` with Skills support for tool description resolution.

#### Scenario: Tool description resolution with confidence
- **WHEN** tool descriptions are needed for prompt building
- **THEN** they SHALL be resolved using `ToolDescriptionProvider` with confidence context
- **THEN** the appropriate phase description SHALL be selected based on confidence
- **THEN** Phase 1 descriptions SHALL be used for initial tool discovery

## REMOVED Requirements

### Requirement: Plugin Runtime Integration

**Reason**: The Plugin system is being completely removed. ChatService SHALL NOT use PluginRuntime.

**Migration**: All tool execution SHALL go through SkillsExecutionManager.

### Requirement: Plugin-based Message Preprocessing

**Reason**: Plugin-based message preprocessing is no longer supported. Preprocessing SHALL be handled internally or via Skills.

**Migration**: If preprocessing is needed, it SHALL be implemented as Skills or handled internally in ChatService.

