## ADDED Requirements

### Requirement: Emotion Memory Recording
The memory subsystem SHALL provide a `recordEmotion` operation that persists detected emotions as structured metadata without blocking the chat workflow.

#### Scenario: Persist emotion metadata
- **WHEN** ChatService calls `recordEmotion` with a user identifier, detected emotion payload, and message context
- **THEN** MemoryService SHALL upsert a memory document whose `metadata.emotion` includes `type`, `intensity`, and `confidence`
- **AND** the operation SHALL resolve asynchronously so chat responses are not delayed.

#### Scenario: Non-blocking failure handling
- **WHEN** the underlying RAG service rejects an emotion write
- **THEN** MemoryService SHALL swallow the failure, log a warning, and ChatService SHALL keep responding without surfacing an error to the user.

---

### Requirement: Emotion-Aware Recall
Memories recalled from the RAG backend SHALL expose any stored emotion metadata so downstream services can reason about historical sentiment.

#### Scenario: Recall returns emotion metadata
- **WHEN** ChatService recalls memories that were recorded with emotions
- **THEN** each returned memory SHALL include the original `metadata.emotion` payload so downstream personalization can consume it.

---

### Requirement: ChatService Emotion Hooks
ChatService SHALL invoke the emotion recording workflow after generating assistant replies for both buffered and streaming conversations whenever EmotionEngine reports a detected emotion.

#### Scenario: Post-response emotion recording (JSON)
- **WHEN** `processMessage` finishes composing the assistant reply and a detected emotion exists
- **THEN** ChatService SHALL invoke `memoryService.recordEmotion` with the userId, emotion payload, and the reply context before returning the response.

#### Scenario: Post-response emotion recording (Streaming)
- **WHEN** `streamMessage` completes streaming a response
- **AND** EmotionEngine provided a detected emotion
- **THEN** ChatService SHALL queue `recordEmotion` after the stream closes so that streaming sessions capture the same metadata as JSON flows.

