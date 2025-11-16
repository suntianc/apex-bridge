## MODIFIED Requirements

### Requirement: Protocol Engine

The `ProtocolEngine` SHALL use `SkillsExecutionManager` as the primary execution engine for all tool calls.

The engine SHALL NOT use `PluginRuntime` for tool execution.

The engine SHALL integrate with `SkillsToolDescriptionGenerator` for tool description generation.

The engine SHALL support three-phase progressive disclosure for tool descriptions.

#### Scenario: ProtocolEngine initialization without PluginRuntime
- **WHEN** `ProtocolEngine.initialize()` is called
- **THEN** it SHALL NOT initialize `PluginRuntime`
- **THEN** it SHALL initialize `SkillsExecutionManager`
- **THEN** it SHALL initialize `SkillsToolDescriptionGenerator`
- **THEN** it SHALL register `ToolDescriptionProvider` with Skills support

#### Scenario: Tool execution via ProtocolEngine
- **WHEN** a tool execution request is received
- **THEN** it SHALL be routed to `SkillsExecutionManager`
- **THEN** it SHALL NOT be routed to `PluginRuntime`
- **THEN** it SHALL return the execution result

### Requirement: Tool Description Provider Integration

The `ToolDescriptionProvider` SHALL be integrated with `SkillsToolDescriptionGenerator`.

The provider SHALL support confidence-based description phase selection.

The provider SHALL use Skills metadata instead of Plugin manifests.

#### Scenario: Tool description generation from Skills
- **WHEN** tool descriptions are requested
- **THEN** they SHALL be generated from Skills metadata
- **THEN** they SHALL support three-phase progressive disclosure
- **THEN** they SHALL NOT use Plugin manifests

#### Scenario: All tools description with confidence
- **WHEN** `{{ABPAllTools}}` or `{{tool:*}}` is resolved with confidence context
- **THEN** it SHALL generate descriptions based on confidence thresholds
- **THEN** Phase 1 descriptions SHALL be used by default
- **THEN** Phase 2 or Phase 3 descriptions SHALL be used based on confidence

## REMOVED Requirements

### Requirement: Plugin Runtime Integration

**Reason**: The Plugin system is being completely removed. ProtocolEngine SHALL NOT integrate with PluginRuntime.

**Migration**: All plugin functionality SHALL be migrated to Skills system.

### Requirement: Plugin Loader Support

**Reason**: Plugin loading is no longer supported. Skills loading SHALL be used instead.

**Migration**: Existing plugins SHALL be migrated to Skills format using the migration tool.

### Requirement: Plugin Manifest Support

**Reason**: `plugin-manifest.json` format is no longer supported. Skills metadata format SHALL be used instead.

**Migration**: Plugin manifests SHALL be converted to `METADATA.yml` format during migration.

