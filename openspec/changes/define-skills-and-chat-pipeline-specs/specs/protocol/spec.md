## ADDED Requirements

### Requirement: ABP-only Tool Parsing and Execution
The system SHALL support ABP protocol only for tool parsing and execution and ignore VCP blocks.

#### Scenario: Parse ABP only
- WHEN mixed ABP and VCP blocks are present
- THEN only ABP tool calls are parsed and executed

### Requirement: Skills-bound Tool Descriptions
The protocol engine SHALL integrate ToolDescriptionProvider bound to SkillsToolDescriptionGenerator to supply progressive tool descriptions.

#### Scenario: Bind Skills generator
- WHEN protocol engine initializes
- THEN ToolDescriptionProvider is registered and bound to the Skills description generator


