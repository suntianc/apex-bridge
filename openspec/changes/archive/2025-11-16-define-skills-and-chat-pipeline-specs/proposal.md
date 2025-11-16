## Why
We migrated runtime to a skills-only architecture but specs for skills, chat-pipeline, and protocol bindings were not formalized. We need authoritative specs to keep source of truth aligned with implementation.

## What Changes
- ADDED: `skills` capability specification (capability model, packaging, execution, security)
- ADDED: `chat-pipeline` capability specification (tool description progressive disclosure; tool execution via Skills)
- MODIFIED: `protocol` capability to ABP-only and Skills-bound tool description

## Impact
- Affected specs: skills, chat-pipeline, protocol
- Affected code: `src/core/skills/*`, `src/services/ChatService.ts`, `src/core/ProtocolEngine.ts`, variable providers

## Notes
- This change describes already-implemented behavior for spec alignment.


