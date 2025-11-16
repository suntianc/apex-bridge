## ADDED Requirements

### Requirement: Prompt Structure Specification

The system SHALL use a standardized prompt structure format for all chat requests to ensure consistent Agent output.

#### Scenario: Standard prompt structure
- **WHEN** a chat request is processed
- **THEN** the system SHALL construct prompt in the following order:
  - `[SYSTEM]` section: Persona prompt, Household Profile (optional), User Profile (optional)
  - `[MEMORY]` section: High-importance Semantic memory (topK=3), Relevant Episodic memory (topK=1), Session history (last N messages)
  - `[RAG]` section (if needed): Retrieved KB documents
  - `[USER]` section: Current user message
  - `[TOOL INSTR]` section: ABP tool call format definition (always included / dynamic)

#### Scenario: Agent persona prompt layout
- **WHEN** different Agent personas are used
- **THEN** the system SHALL use persona-specific prompt layout templates
- **AND** maintain consistent structure across all personas

### Requirement: Memory Injection Strategy

The system SHALL implement intelligent memory injection strategy with token limits and priority ordering.

#### Scenario: Memory selection algorithm
- **WHEN** memories are injected into prompt
- **THEN** the system SHALL select memories based on:
  - Importance score (1-5)
  - Relevance to current query
  - Time decay factor
- **AND** prioritize in order: Profile > Semantic > Episodic > Session

#### Scenario: Token limit control
- **WHEN** memories are injected
- **THEN** the system SHALL control:
  - Maximum number of memory entries
  - Maximum token count for memory section
- **AND** prevent prompt explosion

#### Scenario: Dynamic memory injection
- **WHEN** different scenarios require different memory context
- **THEN** the system SHALL dynamically adjust memory injection strategy
- **AND** support scenario-specific configurations

## MODIFIED Requirements

### Requirement: Chat Pipeline Memory Integration

The Chat Pipeline SHALL integrate four-dimensional memory system with standardized prompt structure.

#### Scenario: Memory retrieval and injection
- **WHEN** a chat request is received
- **THEN** the system SHALL:
  - Load context memories (Profile, Session, Semantic, Episodic)
  - Apply visibility and access control filtering
  - Select topK memories based on importance and relevance
  - Inject memories into prompt following standard structure
  - Include ABP tool instruction section

#### Scenario: Memory write after tool execution
- **WHEN** a skill execution completes with memoryWrites
- **THEN** the system SHALL:
  - Collect memoryWrites from ToolExecutionResult
  - Submit to IMemoryService.appendMemory
  - Handle conflict resolution if conflicts detected
  - Update vector index if semantic/episodic memory

