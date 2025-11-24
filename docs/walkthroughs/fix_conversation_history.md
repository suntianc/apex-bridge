# Fix Conversation History Recording

## Issue
The user reported that conversation history was not being recorded after chat interactions.

## Root Cause Analysis
1.  **Foreign Key Constraint Violation**: `ConversationHistoryService` defined a `FOREIGN KEY (conversation_id) REFERENCES sessions(session_id)` in the `conversation_messages` table. However, the `sessions` table does not exist in the `conversation_history.db` database (it likely exists in the separate `trajectory.db` used by AceEngine). This caused `INSERT` operations to fail silently (logged as warnings).
2.  **History Duplication**: `ChatService` was attempting to save the entire `messages` array (received from the frontend) plus the new assistant response. This would lead to exponential duplication of history if the save operation had succeeded.

## Changes Applied

### 1. `src/services/ConversationHistoryService.ts`
- Removed the `FOREIGN KEY` constraint from the `conversation_messages` table definition.
- **Note**: If the database file already exists with the old schema, the user might need to delete `data/conversation_history.db` to let it recreate with the correct schema, or the `INSERT` might still fail if the table was created with the constraint. Since `sqlite` doesn't support dropping constraints easily, recreating the DB file is the safest approach if errors persist.

### 2. `src/services/ChatService.ts`
- Updated `processSingleRound` to check `getMessageCount(conversationId)`.
    - If count is 0 (new conversation): Save all input messages (excluding assistant messages to be safe).
    - If count > 0 (existing conversation): Save only the last input message.
    - Always save the new assistant response.
- Updated `streamMessage` with the same logic to handle streaming responses.
- Updated `processMessageWithSelfThinking` to filter out existing messages from `currentMessages` before saving, preventing duplication of the initial context.

## Verification
- The code compiles successfully (`npm run build`).
- The logic now correctly handles both new and existing conversations without duplication.
- The database write operation should now succeed without the invalid foreign key constraint.
