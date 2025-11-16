## REMOVED Requirements

### Requirement: VCP Protocol Support

The system SHALL NOT support VCP protocol parsing, tool requests, or any VCP-specific functionality.

#### Scenario: VCP protocol parsing removed
- **WHEN** LLM outputs VCP format tool requests (`<<<[TOOL_REQUEST]>>>`)
- **THEN** the system SHALL NOT parse or execute these requests
- **AND** SHALL return an error or plain text response

#### Scenario: VCP fallback removed
- **WHEN** ABP protocol parsing fails
- **THEN** the system SHALL NOT fallback to VCP protocol
- **AND** SHALL return an error or plain text response

### Requirement: VCP Protocol Converter

The system SHALL NOT provide any VCP to ABP conversion utilities.

#### Scenario: VCP conversion removed
- **WHEN** a caller attempts to convert VCP format to ABP format
- **THEN** the conversion utility SHALL NOT be available
- **AND** SHALL return an error indicating VCP support has been removed

## UPDATED Requirements

### Requirement: Protocol Engine

The system SHALL use a unified protocol engine that only supports ABP protocol.

#### Scenario: ABP-only protocol parsing
- **WHEN** LLM outputs ABP format tool requests (`[[ABP_TOOL:ToolName]]`)
- **THEN** the system SHALL parse and execute these requests
- **AND** SHALL NOT attempt VCP protocol parsing

#### Scenario: Protocol engine naming
- **WHEN** code references the protocol engine
- **THEN** it SHALL use `ProtocolEngine` instead of `VCPEngine`
- **AND** all imports and references SHALL be updated accordingly

### Requirement: WebSocket Paths

The system SHALL use ABP-prefixed or generic paths instead of VCP-prefixed paths.

#### Scenario: Log channel path
- **WHEN** a client connects to the log WebSocket channel
- **THEN** it SHALL use `/ABPlog` or `/log` instead of `/VCPlog`
- **AND** authentication SHALL use `ABP_Key` instead of `VCP_Key`

#### Scenario: Distributed server path
- **WHEN** a node connects to the distributed server channel
- **THEN** it SHALL use `/abp-distributed-server` or `/distributed-server` instead of `/vcp-distributed-server`
- **AND** authentication SHALL use `ABP_Key` instead of `VCP_Key`

### Requirement: Configuration Keys

The system SHALL use ABP-prefixed or generic configuration keys instead of VCP-prefixed keys.

#### Scenario: API key configuration
- **WHEN** configuring API authentication keys
- **THEN** the system SHALL use `apiKey` or `abpKey` instead of `vcpKey`
- **AND** environment variables SHALL use `ABP_KEY` or `ABP_API_KEY` instead of `VCP_KEY` or `VCP_API_KEY`

