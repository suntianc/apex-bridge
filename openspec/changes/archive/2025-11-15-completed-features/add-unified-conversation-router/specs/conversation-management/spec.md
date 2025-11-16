## ADDED Requirements

### Requirement: Unified Conversation Router
The system SHALL provide a ConversationRouter that processes `/v1/chat/completions` requests, parses `apexMeta` metadata, resolves the target personas/nodes, and dispatches messages to Hub/Companion/Worker nodes through ConversationContextStore.

#### Scenario: Single persona routed to hub
- **GIVEN** a request without `apexMeta` or with `target.type = hub`
- **WHEN** the client invokes `/v1/chat/completions`
- **THEN** the ConversationRouter SHALL forward the request to ChatService using the bound hub persona and include the updated ConversationContext.

#### Scenario: Persona mapped to companion node
- **GIVEN** a request whose `apexMeta` resolves to a companion persona and node binding
- **WHEN** the client invokes `/v1/chat/completions`
- **THEN** the ConversationRouter SHALL dispatch a `companion_conversation` task to the bound node through NodeManager and return the response (or task receipt when asynchronous).

### Requirement: Conversation Context Store
The system SHALL maintain a ConversationContextStore that records conversation members, message history, pending tasks, and persona-specific memory namespaces keyed by `conversationId`.

#### Scenario: Context retrieved on subsequent message
- **GIVEN** a conversation with prior messages stored in ConversationContextStore
- **WHEN** a new `/v1/chat/completions` request arrives with the same `conversationId`
- **THEN** the ConversationRouter SHALL load the existing context and supply it to ChatService or node tasks.

### Requirement: Group Mentions and Broadcast
The system SHALL support group conversations where a message can @ specific personas; mentioned AI MUST receive mandatory dispatch, while other members MAY receive the broadcast and decide whether to respond.

#### Scenario: Mentioned AI must respond
- **GIVEN** a group conversation where `apexMeta.mentions` includes persona `companion-xiaoYue`
- **WHEN** the user sends a message containing `@小悦`
- **THEN** the ConversationRouter SHALL dispatch the message to `companion-xiaoYue`’s node and mark the response as mandatory.

#### Scenario: Non-mentioned AI receives broadcast
- **GIVEN** a group conversation with multiple personas but no @ mention for `worker-gardener`
- **WHEN** a message is sent without mentioning the worker
- **THEN** the ConversationRouter SHALL broadcast the message metadata to `worker-gardener`, allowing its strategy to decide whether to respond.

### Requirement: Tool Authorization Matrix
The system SHALL enforce persona-based tool authorization, including hub tool usage, worker delegation, companion approvals, and access to hub RAG/Memory services.

#### Scenario: Hub persona uses hub tool directly
- **WHEN** a hub persona invokes a hub-scoped tool via `/v1/chat/completions`
- **THEN** ToolAuthorization SHALL permit the call without approval and record the invocation in the conversation history.

#### Scenario: Companion persona requests hub tool
- **WHEN** a companion persona requests a hub tool that requires approval
- **THEN** ToolAuthorization SHALL return a confirmation prompt to the user before executing the tool.

### Requirement: Persona Binding Validation
The system SHALL validate that each persona used in a conversation is bound to the corresponding node (Hub may bind multiple, Companion/Worker exactly one) before dispatching messages or tools.

#### Scenario: Invalid persona binding rejected
- **WHEN** a request references persona `companion-xiaoYue` for a node that is not bound to it
- **THEN** the ConversationRouter SHALL reject the request with an error and not dispatch the task.

---

### Requirement: Persona Memory Namespace Isolation
Conversation routing MUST propagate stable `userId`, `memoryUserId`, and `knowledgeBase` values per persona so that MemoryService isolates content between personas under the same human user.

#### Scenario: User-provided ID seeds namespace
- **WHEN** the client supplies `user` / `userId` in `/v1/chat/completions`
- **THEN** the router SHALL seed `memoryUserId = <user>::<persona>` and `knowledgeBase = <user>-persona-<persona>` inside `ConversationContextStore`
- **AND** ChatService SHALL reuse these values for subsequent requests even if later payloads omit `user`.

#### Scenario: Cross-persona isolation
- **WHEN** the same `user` talks to personas A and B
- **THEN** persona A's memory operations SHALL use `knowledgeBase = <user>-persona-A`
- **AND** persona B SHALL use `knowledgeBase = <user>-persona-B`
- **AND** recalling persona A memories MUST NOT surface persona B content.

---

### Requirement: Conversation Event Broadcasting
The router SHALL emit structured events (`conversation:user_message`, `conversation:assistant_message`, `tool_approval_requested`, `tool_approval_completed`) so AdminPanel/WebSocket subscribers can observe conversation state in real time.

#### Scenario: User message event
- **WHEN** a user message is accepted into a conversation
- **THEN** the router SHALL publish `conversation:user_message` with `conversationId`, latest message content, mentions, members, and personaState snapshot.

#### Scenario: Approval lifecycle events
- **WHEN** a tool requires approval
- **THEN** `tool_approval_requested` SHALL be emitted with approver metadata
- **AND** after the approver responds, `tool_approval_completed` SHALL broadcast the decision for audit consumers.


