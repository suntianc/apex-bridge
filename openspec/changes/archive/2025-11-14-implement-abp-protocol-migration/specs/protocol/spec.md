## ADDED Requirements

### Requirement: ABP Protocol Implementation

The system SHALL implement ABP (ApexBridge Protocol) as an independent protocol to replace VCP protocol for commercial compliance.

#### Scenario: ABP tool request parsing
- **WHEN** LLM outputs ABP tool request in format `[[ABP_TOOL:ToolName]]` with JSON parameters
- **THEN** the system SHALL parse the tool name from the marker
- **AND** parse the JSON parameters
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

### Requirement: Semantic Memory Service Interface

The system SHALL expose a first-class Semantic Memory Service to persist, retrieve, and search user memories using vector similarity.

#### Scenario: Persist semantic memory record
- **WHEN** ChatService (or any caller) invokes `saveSemantic` with userId, personaId, embedding vector, importance score, and raw content
- **THEN** the service SHALL validate required fields
- **AND** de-duplicate by hash/persona scope
- **AND** persist both structured metadata and embedding id for later retrieval
- **AND** emit `memory:semantic:saved` events for observability

#### Scenario: Query semantic memory records
- **WHEN** a caller issues `searchSimilar` with a query vector, topK, similarity threshold, and context filters (userId, householdId, personaId)
- **THEN** the service SHALL enforce the provided filters
- **AND** return at most topK records ordered by similarity score
- **AND** include the score, source metadata, and canonical content in the response

### Requirement: Semantic Memory Retrieval Controls

Semantic memory searches SHALL provide deterministic guardrails for thresholds, time windows, and debugging.

#### Scenario: Threshold and window enforcement
- **WHEN** a query specifies `minSimilarity` or `timeWindow`
- **THEN** the service SHALL drop results below the threshold or outside the window
- **AND** include diagnostics (matchedCount, filteredCount) so ChatService can decide whether to fallback to episodic memory

#### Scenario: Context isolation
- **WHEN** multi-tenant deployments supply `householdId` or `personaId`
- **THEN** the service SHALL only surface memories that match the same identifiers, preventing cross-tenant leakage

### Requirement: Semantic Index Lifecycle

The vector index backing semantic memory SHALL support initialization, snapshotting, and recovery using hnswlib-node (or equivalent).

#### Scenario: Index bootstrap
- **WHEN** the service boots with an empty index
- **THEN** it SHALL rebuild from persisted semantic records
- **AND** expose a readiness signal once the index is warm

#### Scenario: Snapshot and restore
- **WHEN** snapshot rotation triggers
- **THEN** the service SHALL flush HNSW index files to `workDir/semantic-index`
- **AND** on restart, load the snapshot before accepting writes

#### Scenario: Health and backpressure
- **WHEN** the index exceeds configured capacity or write latency surpasses target
- **THEN** the service SHALL emit health warnings and may degrade to in-memory store while throttling new writes

### Requirement: Episodic Memory Service Interface

The system SHALL expose an episodic memory service to capture time-ordered events and surface them for prompt injection.

#### Scenario: Record episodic event
- **WHEN** ChatService (or automation) invokes `recordEvent` with userId, timestamp, personaId, eventType, and content
- **THEN** the service SHALL append the event to a chronological store
- **AND** ensure ordering and deduplication within the same persona context
- **AND** emit `memory:episodic:saved` for observability

#### Scenario: Query episodic window
- **WHEN** a caller requests `queryWindow` with `from/to` or `lastDays`, `topK`, and persona filters
- **THEN** the service SHALL return events sorted by timestamp descending
- **AND** include metadata (eventType, importance, source)
- **AND** support diagnostics describing how many events were filtered or returned

### Requirement: Episodic Retrieval Controls

Episodic queries SHALL enforce context isolation and flexible windowing.

#### Scenario: Context isolation
- **WHEN** `userId`, `householdId`, or `personaId` is provided
- **THEN** only events matching those identifiers SHALL be returned

#### Scenario: Window enforcement
- **WHEN** `lastDays` or explicit `from/to` is used
- **THEN** events outside the window SHALL be dropped
- **AND** diagnostics SHALL record the drop counts and total scanned entries

### Requirement: Episodic Timeline Store

The episodic memory store SHALL persist time series data with snapshot and recovery capabilities.

#### Scenario: Snapshot and compaction
- **WHEN** the store reaches capacity or scheduled rotation triggers
- **THEN** it SHALL flush segments to disk (`timeline/*.segment`) and compact archives without blocking writes

#### Scenario: Warm restart
- **WHEN** the service reboots
- **THEN** it SHALL rebuild in-memory indexes from persisted segments before accepting queries
- **AND** expose readiness so ChatService knows when episodic memory is available

#### Scenario: Retention policy
- **WHEN** retention is configured (e.g., 90 days)
- **THEN** the store SHALL prune expired segments while logging the number of deleted events

### Requirement: Episodic-Semantic Event Bridge

Episodic timeline events SHALL be broadcast via the event bus so Semantic Memory can react consistently.

#### Scenario: Saved event fan-out
- **WHEN** `memory:episodic:saved` is emitted
- **THEN** the payload SHALL include `userId`, `personaId`, `eventType`, `timestamp`, `importance`, `content`, and the originating `segmentId`
- **AND** Semantic Memory subscribers SHALL evaluate the event against routing policies (importance threshold, eventType whitelist) before invoking `saveSemantic`
- **AND** the bridge SHALL record diagnostics (timelineLagMs, segmentCount) for monitoring

#### Scenario: Pruned event reconciliation
- **WHEN** `memory:episodic:pruned` is emitted due to retention or manual cleanup
- **THEN** the payload SHALL enumerate the pruned record ids or hashes
- **AND** Semantic Memory SHALL demote or delete linked semantic records within the same user/persona scope
- **AND** emit security/audit logs describing the reconciliation action

#### Scenario: Warning escalation
- **WHEN** the episodic store emits `memory:episodic:warning` (e.g., write latency, segment corruption)
- **THEN** the bridge SHALL forward the warning to the monitoring bus with severity and remediation hints
- **AND** Semantic Memory SHALL temporarily suspend automatic ingestions (saveSemantic) until a healthy signal is observed

### Requirement: Memory Conflict Detection

The system SHALL detect potential memory conflicts using multi-signal heuristics before arbitration.

#### Scenario: Semantic similarity signal
- **WHEN** a candidate memory includes an embedding
- **AND** an existing memory for the same user exceeds the configured cosine similarity threshold
- **THEN** the detector SHALL emit a `semantic` conflict signal containing the score and target memory id

#### Scenario: Keyword overlap signal
- **WHEN** the normalized keyword overlap ratio between a candidate and existing memory exceeds the configured threshold
- **THEN** the detector SHALL emit a `keyword` conflict signal referencing the overlapping keywords

#### Scenario: Time window signal
- **WHEN** two memories occur within the configured time window (e.g., ±5 minutes)
- **THEN** the detector SHALL emit a `time` conflict signal describing the delta and window size

#### Scenario: Importance difference signal
- **WHEN** two memories differ in importance by more than the configured delta
- **THEN** the detector SHALL emit an `importance` conflict signal so downstream arbitration can reconcile priorities

### Requirement: Memory Conflict Arbitration

The system SHALL automatically arbitrate detected memory conflicts using multi-factor scoring and configurable strategies.

#### Scenario: Importance-based arbitration
- **WHEN** `priorityImportance` is enabled and two conflicting memories have different importance scores
- **THEN** the arbiter SHALL select the memory with the higher importance score as the winner
- **AND** return an `ArbitrationResult` with `action: 'keep'`, `winner`, `loser`, and a confidence score based on the importance difference

#### Scenario: Recency-based arbitration
- **WHEN** `priorityRecency` is enabled and two conflicting memories have different timestamps
- **THEN** the arbiter SHALL select the memory with the more recent timestamp as the winner
- **AND** return an `ArbitrationResult` with `action: 'keep'` and a confidence score based on the time difference

#### Scenario: Source-based arbitration
- **WHEN** `prioritySource` is enabled and two conflicting memories have different source types
- **THEN** the arbiter SHALL select the memory with the higher source priority (user > conversation > skill > system > inferred)
- **AND** return an `ArbitrationResult` with `action: 'keep'` and a confidence score of 0.7

#### Scenario: Multi-factor scoring
- **WHEN** all single-factor strategies fail to determine a clear winner
- **THEN** the arbiter SHALL compute a weighted multi-factor score (importance 0.4, recency 0.3, source 0.2, semantic 0.1 by default)
- **AND** if the score difference is less than the `mergeThreshold` (default 0.2) and `allowMerge` is true, return `action: 'merge'`
- **AND** otherwise, return `action: 'keep'` with the higher-scoring memory as the winner

#### Scenario: Default strategy fallback
- **WHEN** all arbitration strategies fail to determine a clear winner (e.g., all factors are equal)
- **THEN** the arbiter SHALL apply the configured `defaultStrategy` ('keep-candidate', 'keep-existing', or 'reject')
- **AND** return an `ArbitrationResult` with `confidence: 0.5` and a reason describing the default strategy

#### Scenario: Multiple conflict resolution
- **WHEN** a candidate memory conflicts with multiple existing memories
- **THEN** the arbiter SHALL select the most severe conflict (highest total signal score) for arbitration
- **AND** return an `ArbitrationResult` for that specific conflict

### Requirement: Memory Merging

The system SHALL merge conflicting memories when arbitration determines that merging is appropriate.

#### Scenario: Content merging strategies
- **WHEN** two memories are merged with `contentStrategy: 'concatenate'`
- **THEN** the merged content SHALL be the concatenation of both contents with a newline separator
- **WHEN** two memories are merged with `contentStrategy: 'replace'`
- **THEN** the merged content SHALL be the second memory's content, replacing the first
- **WHEN** two memories are merged with `contentStrategy: 'summarize'`
- **THEN** the merged content SHALL extract common keywords and combine key information from both contents
- **WHEN** two memories are merged with `contentStrategy: 'smart'`
- **THEN** the system SHALL use summarize strategy if similarity > 0.7, otherwise use concatenate strategy

#### Scenario: Metadata merging
- **WHEN** two memories are merged with `metadataStrategy.importance: 'max'`
- **THEN** the merged importance SHALL be the maximum of both importance scores
- **WHEN** two memories are merged with `metadataStrategy.importance: 'boost'`
- **THEN** the merged importance SHALL be the maximum importance plus the configured boost amount (default 0.1, capped at 1.0)
- **WHEN** two memories are merged with `metadataStrategy.importance: 'average'`
- **THEN** the merged importance SHALL be the average of both importance scores
- **WHEN** two memories are merged with `metadataStrategy.timestamp: 'max'`
- **THEN** the merged timestamp SHALL be the maximum (most recent) timestamp
- **WHEN** two memories are merged with `metadataStrategy.keywords: 'union'`
- **THEN** the merged keywords SHALL be the union of both keyword arrays (deduplicated)
- **WHEN** two memories are merged with `metadataStrategy.keywords: 'intersection'`
- **THEN** the merged keywords SHALL be the intersection of both keyword arrays
- **WHEN** two memories are merged with `metadataStrategy.source: 'prefer-higher'`
- **THEN** the merged source SHALL be the source with higher priority (user > conversation > skill > system > inferred)

#### Scenario: Importance boost
- **WHEN** two memories are merged with `importance: 'boost'` strategy
- **THEN** the merged importance SHALL be calculated as `min(1.0, max(imp1, imp2) + boostAmount)`
- **AND** the boost amount SHALL be configurable (default 0.1)

#### Scenario: Content deduplication
- **WHEN** two memories are merged with `deduplicate: true`
- **THEN** the merged content SHALL remove duplicate sentences (based on normalized sentence comparison)
- **AND** the deduplication threshold SHALL be configurable (default 0.8)

#### Scenario: Merge result statistics
- **WHEN** two memories are merged
- **THEN** the `MergeResult` SHALL include statistics: `contentLength`, `keywordsCount`, `importanceDelta`, `deduplicatedCount`
- **AND** these statistics SHALL reflect the changes made during merging

### Requirement: Configurable Merge Rules

The system SHALL support configurable merge rules with inheritance, runtime updates, and conditional matching.

#### Scenario: Rule registration and lookup
- **WHEN** a `MergeRuleConfig` is registered with a unique name
- **THEN** the rule SHALL be stored in the `MergeRuleRegistry`
- **AND** the rule SHALL be retrievable by name via `getRule(name)`
- **AND** the registry version SHALL be incremented

#### Scenario: Rule inheritance
- **WHEN** a rule specifies `extends: 'base-rule-name'`
- **THEN** the rule SHALL inherit all properties from the base rule
- **AND** properties specified in the derived rule SHALL override inherited properties
- **AND** nested objects (e.g., `arbitration`, `merge`) SHALL be deep-merged
- **AND** inheritance SHALL support multiple levels (recursive resolution)

#### Scenario: Runtime rule updates
- **WHEN** `updateRule(name, updates)` is called
- **THEN** the existing rule SHALL be updated with the provided partial configuration
- **AND** nested objects SHALL be deep-merged (not replaced)
- **AND** the registry version SHALL be incremented
- **AND** a `rule:updated` event SHALL be emitted

#### Scenario: Conditional rule matching
- **WHEN** `findMatchingRule(candidate, existing)` is called
- **THEN** the system SHALL evaluate all enabled rules in priority order (highest first)
- **AND** rules with matching conditions (userId, personaId, source, importanceRange) SHALL be considered
- **AND** the first matching rule SHALL be returned
- **AND** if no rules match, the default rule SHALL be returned

#### Scenario: Rule events
- **WHEN** a rule is registered, updated, or deleted
- **THEN** the system SHALL emit `rule:registered`, `rule:updated`, or `rule:deleted` events respectively
- **AND** event payloads SHALL include the rule name and configuration

#### Scenario: Rule persistence
- **WHEN** `exportRules()` is called
- **THEN** the system SHALL return all registered rules as an array
- **AND** rules SHALL include their `extends` field for persistence
- **WHEN** `loadRules(rules)` is called
- **THEN** the system SHALL register all provided rules
- **AND** inheritance SHALL be resolved during registration


