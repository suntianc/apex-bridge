## ADDED Requirements

### Requirement: ABP Protocol Implementation

The system SHALL implement ABP (ApexBridge Protocol) as an independent protocol to replace VCP protocol for commercial compliance.

#### Scenario: ABP tool request parsing
- **WHEN** LLM outputs ABP tool request in format `[[ABP_TOOL:ToolName]]`
- **THEN** the system SHALL parse the JSON parameters
- **AND** validate the tool request structure
- **AND** execute the tool

#### Scenario: ABP protocol error recovery
- **WHEN** LLM output contains malformed JSON or extra text
- **THEN** the system SHALL attempt to:
  - Automatically repair JSON (complete missing brackets, quotes)
  - Strip noise text and extract valid JSON
  - Validate protocol boundaries (start/end markers)
  - Handle multiple JSON blocks (take the last valid block)
  - Extract ABP block from cluttered output
- **AND** if parsing fails completely, SHALL fallback to plain text response

#### Scenario: ABP protocol fallback
- **WHEN** ABP protocol parsing fails
- **THEN** the system SHALL fallback to VCP protocol (if dual-protocol mode enabled)
- **OR** return plain text response if fallback not available

### Requirement: Dual Protocol Compatibility

The system SHALL support both VCP and ABP protocols during transition period.

#### Scenario: Dual protocol mode
- **WHEN** dual-protocol mode is enabled
- **THEN** the system SHALL attempt to parse ABP protocol first
- **AND** if ABP parsing fails, SHALL fallback to VCP protocol
- **AND** track fallback statistics for monitoring

## MODIFIED Requirements

### Requirement: Protocol Parser Error Handling

The protocol parser SHALL implement comprehensive error recovery mechanisms to handle LLM output inconsistencies.

#### Scenario: JSON repair
- **WHEN** LLM outputs incomplete JSON (missing closing bracket)
- **THEN** the parser SHALL automatically complete the JSON structure
- **AND** validate the repaired JSON before use

#### Scenario: Noise text handling
- **WHEN** LLM output contains explanatory text before/after JSON
- **THEN** the parser SHALL extract only the valid JSON portion
- **AND** ignore surrounding text

