## ADDED Requirements

### Requirement: Four-Dimensional Memory System

The system SHALL implement a four-dimensional memory system: Profile, Session, Semantic, and Episodic memory.

#### Scenario: Profile memory storage
- **WHEN** user or household profile is updated
- **THEN** the system SHALL store it in Profile Memory
- **AND** make it available for prompt injection

#### Scenario: Session memory storage
- **WHEN** a conversation message is processed
- **THEN** the system SHALL store it in Session Memory (last N messages, default 50)
- **AND** use it for context in subsequent messages

#### Scenario: Semantic memory storage
- **WHEN** a skill execution suggests a memory write with type 'preference' or 'decision'
- **THEN** the system SHALL store it in Semantic Memory with embedding
- **AND** enable semantic search retrieval

#### Scenario: Episodic memory storage
- **WHEN** a task or project milestone is completed
- **THEN** the system SHALL store a summary in Episodic Memory
- **AND** enable timeline-based retrieval

### Requirement: Memory Conflict Resolution

The system SHALL automatically detect and resolve memory conflicts.

#### Scenario: Conflict detection
- **WHEN** a new memory entry conflicts with existing memory (same topic, different value)
- **THEN** the system SHALL detect the conflict
- **AND** apply automatic arbitration based on importance/recency/source-type

#### Scenario: Automatic conflict resolution
- **WHEN** a memory conflict is detected
- **THEN** the system SHALL resolve it using configured merge rules:
  - "Latest first" - Prefer more recent memory
  - "High importance override" - Prefer higher importance memory
- **AND** log the resolution for audit

#### Scenario: Manual conflict resolution
- **WHEN** an administrator reviews memory conflicts
- **THEN** the system SHALL provide interface to manually merge or override memories
- **AND** preserve resolution history

### Requirement: Memory Visibility and Access Control

The system SHALL implement visibility and access control for memories based on user roles and agent types.

#### Scenario: Private memory access
- **WHEN** a memory has visibility 'private'
- **THEN** only the owner (user/household/group) SHALL access it
- **AND** other users/agents SHALL be denied access

#### Scenario: Role-based memory filtering
- **WHEN** loadContextMemories is called
- **THEN** the system SHALL filter memories based on:
  - Current userId role (parent/child/guest)
  - Current Agent type (work/entertainment/home)
- **AND** return only accessible memories

#### Scenario: Child mode memory restriction
- **WHEN** child Agent requests memories
- **THEN** the system SHALL only return:
  - Own private memories
  - Participated group memories
- **AND** SHALL NOT return parent work memories or household financial memories

### Requirement: Vector Store Lifecycle Management

The system SHALL implement complete lifecycle management for vector stores.

#### Scenario: Batch embedding
- **WHEN** large-scale memory writes occur (migration or bulk import)
- **THEN** the system SHALL process embeddings in batches
- **AND** avoid timeout by processing incrementally

#### Scenario: Safe index reconstruction
- **WHEN** importance/visibility/ownerType fields are changed at scale
- **THEN** the system SHALL safely reconstruct the vector index
- **AND** maintain data integrity during reconstruction

#### Scenario: Index versioning
- **WHEN** vector store structure changes
- **THEN** the system SHALL bump index version
- **AND** prevent conflicts between old and new index formats

#### Scenario: Vector data garbage collection
- **WHEN** memories are deleted or expired
- **THEN** the system SHALL mark them as tombstone
- **AND** periodically garbage collect tombstone vectors

## MODIFIED Requirements

### Requirement: Memory Service Interface

The IMemoryService interface SHALL support four-dimensional memory system with conflict resolution and lifecycle management.

#### Scenario: Memory write with conflict detection
- **WHEN** appendMemory is called with a new memory entry
- **THEN** the system SHALL:
  - Check for conflicts with existing memories
  - Apply automatic resolution if conflict detected
  - Store the memory with embedding
  - Update vector index

#### Scenario: Semantic memory search
- **WHEN** searchSemanticMemories is called
- **THEN** the system SHALL:
  - Perform vector similarity search
  - Filter by ownerType (user/group/task)
  - Apply visibility and access control
  - Return topK results sorted by relevance

