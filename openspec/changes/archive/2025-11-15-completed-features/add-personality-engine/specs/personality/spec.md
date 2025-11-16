## ADDED Requirements

### Requirement: Personality Configuration Loading
The system SHALL load personality configurations from JSON files in `config/personality/` directory.

#### Scenario: Load JSON personality config
- **WHEN** a personality configuration file exists at `config/personality/{agentId}.json`
- **THEN** the system SHALL parse and load the configuration as a PersonalityConfig object
- **AND** the configuration SHALL include identity, traits, style, and optional behavior fields

#### Scenario: Backward compatible TXT loading
- **WHEN** a JSON file does not exist but a TXT file exists at `Agent/{agentId}.txt`
- **THEN** the system SHALL load the TXT file content as a legacy personality configuration
- **AND** the system SHALL extract basic information (name, avatar) if available
- **AND** the TXT content SHALL be used as the System Prompt

#### Scenario: Default personality fallback
- **WHEN** no personality file exists for the requested agent_id
- **THEN** the system SHALL use the default personality configuration
- **AND** the default personality SHALL be loaded from `config/personality/default.json`

---

### Requirement: System Prompt Construction
The system SHALL dynamically build System Prompts from personality configurations using a fixed template.

#### Scenario: Build prompt from JSON config
- **WHEN** a PersonalityConfig is provided with identity, traits, and style
- **THEN** the system SHALL construct a System Prompt that includes:
  - Identity introduction (name, avatar, role, background)
  - Personality traits (core, interests, values)
  - Interaction style (tone, address, emoji usage)
  - Behavior patterns (if provided)
- **AND** the prompt SHALL follow a standardized template format

#### Scenario: Build prompt from TXT config
- **WHEN** a TXT-based personality configuration is provided
- **THEN** the system SHALL construct a System Prompt that includes:
  - Identity introduction (extracted name and avatar)
  - The original TXT file content as the main prompt body

---

### Requirement: Personality Injection into Messages
The system SHALL inject personality-based System Prompts into message lists before LLM calls.

#### Scenario: Inject personality in new conversation
- **WHEN** a chat request includes an `agent_id` parameter
- **THEN** the system SHALL load the corresponding personality configuration
- **AND** the system SHALL build the System Prompt from the personality
- **AND** the System Prompt SHALL be inserted as the first message (role: 'system')
- **AND** any existing system messages from the user SHALL be preserved after the personality system message

#### Scenario: Personality system message priority
- **WHEN** both personality System Prompt and user-provided system messages exist
- **THEN** the personality System Prompt SHALL be placed first (highest priority)
- **AND** user system messages SHALL follow the personality system message
- **AND** regular messages (user/assistant) SHALL follow all system messages

#### Scenario: Default personality when no agent_id
- **WHEN** a chat request does not include an `agent_id` parameter
- **THEN** the system SHALL use the default personality configuration
- **AND** the default personality System Prompt SHALL be injected

---

### Requirement: Multi-Personality Support
The system SHALL support switching between different AI personalities using agent_id.

#### Scenario: Switch personality mid-conversation
- **WHEN** a user provides a different `agent_id` in a subsequent request
- **THEN** the system SHALL load the new personality configuration
- **AND** the new personality System Prompt SHALL replace the previous one
- **AND** the conversation SHALL continue with the new personality traits

#### Scenario: Personality persistence in session
- **WHEN** multiple messages are sent with the same `agent_id` in a conversation
- **THEN** the system SHALL maintain the same personality throughout the conversation
- **AND** the personality System Prompt SHALL be included in each LLM call

---

### Requirement: Personality Caching
The system SHALL cache loaded personality configurations and built System Prompts for performance.

#### Scenario: Cache personality on first load
- **WHEN** a personality configuration is loaded for the first time
- **THEN** the system SHALL cache both the PersonalityConfig and the built System Prompt
- **AND** subsequent requests for the same agent_id SHALL use the cached values

#### Scenario: Cache invalidation on startup
- **WHEN** the server starts or restarts
- **THEN** the system SHALL clear all personality caches
- **AND** personality configurations SHALL be reloaded from files

#### Scenario: Manual cache refresh
- **WHEN** a manual refresh is requested (via API or method call)
- **THEN** the system SHALL invalidate the cache for the specified agent_id
- **AND** the next request SHALL reload the personality from file

---

### Requirement: Personality Configuration Format
The system SHALL support structured JSON personality configuration format.

#### Scenario: Valid JSON personality config
- **WHEN** a JSON file contains valid PersonalityConfig structure
- **THEN** the system SHALL successfully parse and validate the configuration
- **AND** required fields (identity.name, traits.core, style.tone, style.address, style.emojiUsage) SHALL be present
- **AND** optional fields (identity.avatar, identity.role, identity.background, behavior) MAY be omitted

#### Scenario: Invalid JSON personality config
- **WHEN** a JSON file contains invalid structure or missing required fields
- **THEN** the system SHALL log an error
- **AND** the system SHALL fall back to the default personality configuration

---

### Requirement: Agent ID Resolution
The system SHALL resolve agent_id to personality configuration files using a priority order.

#### Scenario: Resolve agent_id to JSON file
- **WHEN** an agent_id is provided (e.g., "小文")
- **THEN** the system SHALL first check for `config/personality/{agentId}.json`
- **AND** if found, the system SHALL load the JSON configuration

#### Scenario: Resolve agent_id to TXT file
- **WHEN** no JSON file exists for the agent_id
- **THEN** the system SHALL check for `Agent/{agentId}.txt`
- **AND** if found, the system SHALL load the TXT file as legacy personality

#### Scenario: Agent ID with special characters
- **WHEN** an agent_id contains Chinese characters or special characters
- **THEN** the system SHALL support the agent_id as-is for file lookup
- **AND** the system SHALL validate agent_id format (alphanumeric, Chinese, hyphen) before lookup

