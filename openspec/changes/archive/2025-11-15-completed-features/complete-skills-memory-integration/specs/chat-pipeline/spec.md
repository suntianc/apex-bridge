## MODIFIED Requirements

### Requirement: Chat Pipeline Memory Injection

The Chat Pipeline SHALL inject memory information into prompts to provide context for LLM responses.

#### Scenario: Chat Pipeline injects User Profile
- **WHEN** a chat request is received
- **THEN** the system SHALL inject UserProfile into the prompt
- **AND** the UserProfile SHALL be placed in the [SYSTEM] section
- **AND** the UserProfile SHALL be retrieved from IMemoryService

#### Scenario: Chat Pipeline injects Household Profile
- **WHEN** a chat request is received
- **AND** the user belongs to a household
- **THEN** the system SHALL inject HouseholdProfile into the prompt
- **AND** the HouseholdProfile SHALL be placed in the [SYSTEM] section
- **AND** the HouseholdProfile SHALL be retrieved from IMemoryService

#### Scenario: Chat Pipeline injects Session Memory
- **WHEN** a chat request is received
- **THEN** the system SHALL inject recent messages (Session Memory) into the prompt
- **AND** the Session Memory SHALL be placed in the [MEMORY] section
- **AND** the Session Memory SHALL be limited to the last N messages (default: 50)
- **AND** the Session Memory SHALL be filtered by userId and householdId

#### Scenario: Chat Pipeline filters memory by context
- **WHEN** memory is retrieved for injection
- **THEN** the system SHALL filter memory by userId
- **AND** filter memory by householdId
- **AND** respect visibility and permission settings

#### Scenario: Chat Pipeline reserves space for future memory types
- **WHEN** the prompt is constructed
- **THEN** the system SHALL reserve space for Semantic Memory
- **AND** reserve space for Episodic Memory
- **AND** implement placeholder interfaces for future integration

