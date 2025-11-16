## ADDED Requirements

### Requirement: Memory Write Suggestion Interface

The system SHALL provide a `MemoryWriteSuggestion` interface for skills to suggest memory writes.

#### Scenario: Skill suggests memory write
- **WHEN** a skill execution completes
- **AND** the skill returns memoryWrites in the result
- **THEN** the system SHALL collect the memoryWrites
- **AND** submit them to IMemoryService.appendMemory
- **AND** each MemoryWriteSuggestion SHALL include:
  - `ownerType: 'user' | 'household' | 'task' | 'group'` - Memory owner type
  - `ownerId: string` - Memory owner ID
  - `type: 'preference' | 'fact' | 'event' | 'summary'` - Memory type
  - `importance: number` - Importance level (1-5)
  - `content: string` - Memory content
  - `metadata?: Record<string, any>` - Optional metadata

### Requirement: Step Trace Interface

The system SHALL provide a `StepTrace` interface for tracking intermediate steps during skill execution.

#### Scenario: Skill execution tracks intermediate steps
- **WHEN** a skill executes with multiple steps
- **THEN** each step SHALL be tracked in `intermediateSteps` with:
  - `stepId: string` - Unique step identifier
  - `stepName: string` - Human-readable step name
  - `input: any` - Step input data
  - `output: any` - Step output data
  - `duration: number` - Step execution duration in milliseconds
  - `error?: Error` - Optional error if step failed
  - `timestamp?: number` - Optional timestamp

#### Scenario: Intermediate steps used for debugging
- **WHEN** intermediateSteps are collected
- **THEN** the system SHALL use them for debugging logs
- **AND** integrate them into observability monitoring
- **AND** use them for performance analysis

