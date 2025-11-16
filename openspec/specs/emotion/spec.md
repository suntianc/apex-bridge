# emotion Specification

## Purpose
TBD - created by archiving change add-emotion-engine. Update Purpose after archive.
## Requirements
### Requirement: Emotion Detection
The system SHALL detect user emotions from text messages using LLM-based analysis.

#### Scenario: Detect happy emotion
- **WHEN** a user message contains positive expressions (e.g., "太好了！", "我很开心")
- **THEN** the system SHALL identify the emotion as `happy` with confidence score
- **AND** the detection SHALL complete within 100ms

#### Scenario: Detect sad emotion
- **WHEN** a user message contains negative expressions (e.g., "我很难过", "心情不好")
- **THEN** the system SHALL identify the emotion as `sad` with confidence score

#### Scenario: Detect neutral emotion
- **WHEN** a user message contains no clear emotional indicators
- **THEN** the system SHALL identify the emotion as `neutral`
- **AND** the system SHALL proceed with normal response without emotional adjustment

#### Scenario: Fallback on detection failure
- **WHEN** emotion detection fails or times out
- **THEN** the system SHALL use `neutral` as default
- **AND** the conversation SHALL continue normally without interruption

---

### Requirement: Empathetic Response Generation
The system SHALL generate empathetic responses based on detected emotions and personality configuration.

#### Scenario: Generate empathetic response for sad emotion
- **WHEN** user emotion is detected as `sad`
- **AND** the personality is configured as "温暖伙伴"
- **THEN** the system SHALL generate a warm, comforting response using appropriate templates
- **AND** the response SHALL reflect the personality's style (e.g., "爸爸" addressing, frequent emojis)

#### Scenario: Generate empathetic response for happy emotion
- **WHEN** user emotion is detected as `happy`
- **AND** the personality is configured as "专业助手"
- **THEN** the system SHALL generate a positive but professional response
- **AND** the response SHALL reflect the personality's style (e.g., "您" addressing, rare emojis)

#### Scenario: Personality-specific response templates
- **WHEN** the same emotion is detected
- **AND** different personalities are used
- **THEN** the system SHALL generate different response styles according to each personality's template
- **AND** the differences SHALL be noticeable in tone, address, and emoji usage

---

### Requirement: Emotion Response Templates
The system SHALL maintain a library of emotion response templates that can be personalized by personality.

#### Scenario: Load default emotion templates
- **WHEN** the system starts
- **THEN** the system SHALL load default emotion response templates from `config/emotion/` directory
- **AND** templates SHALL cover all 6 emotion types (happy, sad, angry, excited, neutral, anxious)

#### Scenario: Load personality-specific templates
- **WHEN** a personality is loaded
- **AND** personality-specific emotion templates exist
- **THEN** the system SHALL prefer personality-specific templates over default templates
- **AND** if personality-specific template does not exist, the system SHALL use default template

#### Scenario: Template format and structure
- **WHEN** emotion templates are loaded
- **THEN** templates SHALL be in JSON format
- **AND** each template SHALL contain response text and optional metadata (emojis, tone indicators)

---

### Requirement: Emotion Integration with ChatService
The system SHALL integrate emotion detection into the chat processing flow.

#### Scenario: Emotion detection in chat flow
- **WHEN** a chat message is processed
- **THEN** the system SHALL detect user emotion before LLM call
- **AND** the detected emotion SHALL be included in the System Prompt context
- **AND** the LLM SHALL generate response considering the detected emotion

#### Scenario: Emotion in streaming chat
- **WHEN** streaming chat is used
- **THEN** emotion detection SHALL occur before streaming starts
- **AND** the streaming response SHALL reflect the empathetic adjustment

#### Scenario: Performance impact
- **WHEN** emotion detection is performed
- **THEN** the total processing time increase SHALL be less than 100ms
- **AND** the detection SHALL not block the main conversation flow

---

### Requirement: Emotion Caching
The system SHALL cache emotion detection results to improve performance.

#### Scenario: Cache same message emotion
- **WHEN** the same user message is processed multiple times
- **THEN** the system SHALL use cached emotion detection result
- **AND** the cache SHALL be keyed by message content hash

#### Scenario: Cache invalidation
- **WHEN** cache is enabled
- **THEN** cache SHALL be cleared on system restart
- **AND** cache SHALL support manual invalidation via API

---

### Requirement: Emotion Recording (Optional)
The system SHALL support recording detected emotions to memory system for future reference.

#### Scenario: Record strong emotions
- **WHEN** a strong emotion (intensity > 0.7) is detected
- **AND** emotion recording is enabled
- **THEN** the system SHALL record the emotion with context to memory system
- **AND** the recording SHALL be optional (can be disabled via config)

#### Scenario: Emotion recording failure
- **WHEN** emotion recording fails
- **THEN** the system SHALL not interrupt the conversation flow
- **AND** the error SHALL be logged but not exposed to user

---

### Requirement: Fast Mode Emotion Detection
The system SHALL support a fast mode for emotion detection using keyword matching.

#### Scenario: Fast mode keyword matching
- **WHEN** fast mode is enabled
- **AND** user message contains common emotion keywords (e.g., "开心", "难过")
- **THEN** the system SHALL use keyword matching for quick emotion detection
- **AND** the detection SHALL complete in < 10ms

#### Scenario: Fallback to LLM when keywords not found
- **WHEN** fast mode is enabled
- **AND** no emotion keywords are found in the message
- **THEN** the system SHALL fallback to LLM-based detection
- **AND** the fallback SHALL be transparent to the user

