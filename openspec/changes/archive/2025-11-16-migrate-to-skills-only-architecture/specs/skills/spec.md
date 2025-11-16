## ADDED Requirements

### Requirement: Three-Phase Progressive Disclosure Mechanism

The Skills system SHALL implement a three-phase progressive disclosure mechanism for tool descriptions, loading different levels of detail based on confidence thresholds.

#### Phase 1: Metadata Level
- **WHEN** the system starts or a session is initialized
- **THEN** all Skills metadata (name and short description) SHALL be loaded
- **THEN** the description SHALL contain approximately 50 tokens per Skill
- **THEN** the description SHALL be used for tool discovery and initial matching

#### Phase 2: Brief Level
- **WHEN** a tool match confidence exceeds 0.15
- **THEN** the brief description SHALL be loaded
- **THEN** the description SHALL include parameter lists and basic instructions
- **THEN** the description SHALL contain approximately 200 tokens per Skill
- **THEN** the description SHALL be used for tool selection decisions

#### Phase 3: Full Level
- **WHEN** a tool match confidence exceeds 0.7 or the tool is about to be executed
- **THEN** the full description SHALL be loaded
- **THEN** the description SHALL include all details, examples, and best practices
- **THEN** the description SHALL contain approximately 1000-5000 tokens per Skill
- **THEN** the description SHALL be used for tool execution guidance

#### Scenario: Progressive disclosure based on confidence
- **WHEN** a user requests a tool execution
- **AND** the initial confidence is 0.20
- **THEN** Phase 2 (brief) description SHALL be loaded
- **WHEN** the confidence increases to 0.75
- **THEN** Phase 3 (full) description SHALL be loaded
- **THEN** the tool execution SHALL proceed with full context

#### Scenario: Metadata-only loading at startup
- **WHEN** the system starts
- **THEN** only Phase 1 (metadata) descriptions SHALL be loaded
- **THEN** the total token usage SHALL be minimized (< 100 tokens per 10 Skills)

#### Scenario: Confidence threshold configuration
- **WHEN** the system is configured with custom confidence thresholds
- **THEN** the progressive disclosure mechanism SHALL use the configured thresholds
- **THEN** the default thresholds SHALL be 0.15 (Phase 1→Phase 2) and 0.7 (Phase 2→Phase 3)

### Requirement: SkillsToolDescriptionGenerator

The system SHALL provide a `SkillsToolDescriptionGenerator` that generates tool descriptions for three phases based on Skills metadata.

#### Scenario: Phase 1 description generation
- **WHEN** `getMetadataDescription(skillName)` is called
- **THEN** it SHALL extract name and description from `METADATA.yml`
- **THEN** it SHALL return approximately 50 tokens per Skill
- **THEN** it SHALL cache the result permanently (metadata does not change frequently)

#### Scenario: Phase 2 description generation
- **WHEN** `getBriefDescription(skillName)` is called
- **THEN** it SHALL extract parameter lists from ABP tool definitions
- **THEN** it SHALL include basic instructions from metadata
- **THEN** it SHALL return approximately 200 tokens per Skill
- **THEN** it SHALL cache the result with TTL of 30 minutes

#### Scenario: Phase 3 description generation
- **WHEN** `getFullDescription(skillName)` is called
- **THEN** it SHALL load the complete `SKILL.md` content
- **THEN** it SHALL include all details, examples, and best practices
- **THEN** it SHALL return approximately 1000-5000 tokens per Skill
- **THEN** it SHALL cache the result with TTL of 15 minutes

#### Scenario: Confidence-based description selection
- **WHEN** `getDescriptionByConfidence(skillName, confidence)` is called with confidence 0.10
- **THEN** it SHALL return Phase 1 (metadata) description
- **WHEN** called with confidence 0.50
- **THEN** it SHALL return Phase 2 (brief) description
- **WHEN** called with confidence 0.80
- **THEN** it SHALL return Phase 3 (full) description

### Requirement: SkillsToToolMapper

The system SHALL provide a `SkillsToToolMapper` that maps tool calls to Skills execution.

#### Scenario: Tool name to Skill mapping
- **WHEN** `mapToolToSkill(toolName)` is called
- **THEN** it SHALL map the tool name to a corresponding Skill
- **THEN** it SHALL cache the mapping for performance
- **THEN** it SHALL return null if no matching Skill is found

#### Scenario: Tool call to execution request conversion
- **WHEN** `convertToolCallToExecutionRequest(tool)` is called
- **THEN** it SHALL convert `tool.args` to `ExecutionRequest.parameters`
- **THEN** it SHALL set `skillName` from the tool name
- **THEN** it SHALL preserve all parameter values

#### Scenario: Execution response to tool result conversion
- **WHEN** `convertExecutionResponseToToolResult(response)` is called
- **THEN** it SHALL extract `result.data` from the execution response
- **THEN** it SHALL convert it to the expected tool call result format
- **THEN** it SHALL handle errors appropriately

## MODIFIED Requirements

### Requirement: Tool Description Provider

The `ToolDescriptionProvider` SHALL support three-phase progressive disclosure based on confidence thresholds.

The provider SHALL integrate with `SkillsToolDescriptionGenerator` to generate descriptions dynamically.

The provider SHALL accept a confidence parameter in the `resolve()` method context.

The provider SHALL automatically select the appropriate description phase based on confidence:
- Phase 1 (metadata): default or confidence < 0.15
- Phase 2 (brief): confidence >= 0.15 and < 0.7
- Phase 3 (full): confidence >= 0.7

#### Scenario: Confidence-based tool description resolution
- **WHEN** `resolve(toolName, { confidence: 0.20 })` is called
- **THEN** it SHALL return Phase 2 (brief) description
- **WHEN** `resolve(toolName, { confidence: 0.80 })` is called
- **THEN** it SHALL return Phase 3 (full) description

#### Scenario: Default tool description resolution
- **WHEN** `resolve(toolName)` is called without confidence
- **THEN** it SHALL return Phase 1 (metadata) description
- **THEN** it SHALL use the default phase for discovery

### Requirement: Skills Execution Manager

The `SkillsExecutionManager` SHALL be the primary execution engine for all tool calls.

The manager SHALL integrate with `SkillsToToolMapper` to handle tool call mappings.

The manager SHALL support execution by intent with confidence-based tool selection.

#### Scenario: Tool execution via SkillsExecutionManager
- **WHEN** `executeByIntent(toolName, options)` is called
- **THEN** it SHALL use `SkillsToToolMapper` to map tool name to Skill
- **THEN** it SHALL execute the Skill using the appropriate executor
- **THEN** it SHALL return the execution result in the expected format

#### Scenario: Execution with confidence threshold
- **WHEN** `executeByIntent(toolName, { minConfidence: 0.7 })` is called
- **THEN** it SHALL only execute Skills with confidence >= 0.7
- **THEN** it SHALL return an error if no matching Skill meets the threshold

## REMOVED Requirements

### Requirement: Plugin Runtime Support

**Reason**: The Plugin system is being completely removed in favor of the Skills system. All plugin functionality SHALL be migrated to Skills.

**Migration**: 
- Existing plugins SHALL be migrated to Skills format using the automated migration tool
- `plugin-manifest.json` format SHALL no longer be supported
- `PluginRuntime` SHALL be completely removed
- All tool execution SHALL go through `SkillsExecutionManager`

