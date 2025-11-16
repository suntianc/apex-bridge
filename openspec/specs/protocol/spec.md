# Protocol Specification

## Purpose

This specification defines the protocol requirements for ApexBridge, including ABP (ApexBridge Protocol), memory services, conflict resolution, and prompt structure.
## Requirements
### Requirement: Protocol Parser Error Handling

The protocol parser SHALL implement comprehensive error recovery mechanisms to handle LLM output inconsistencies.

#### Scenario: JSON repair
- **WHEN** LLM outputs incomplete JSON (missing closing bracket)
- **THEN** the parser SHALL automatically complete the JSON structure
- **AND** validate the repaired JSON before use

#### Scenario: Noise text handling
- **WHEN** LLM output contains explanatory text before/after JSON
- **THEN** the parser SHALL strip the noise text
- **AND** extract only the valid JSON block

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

