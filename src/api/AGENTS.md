# AGENTS.md

**Generated:** 2026-01-10
**Directory:** src/api

---

## OVERVIEW

REST API layer - Controllers, Middleware, WebSocket, Routes.

---

## WHERE TO LOOK

| Component    | Path                                | Role                                   |
| ------------ | ----------------------------------- | -------------------------------------- |
| Chat API     | `controllers/ChatController.ts`     | Chat completions, streaming            |
| Model API    | `controllers/ModelController.ts`    | Model CRUD operations                  |
| Provider API | `controllers/ProviderController.ts` | Provider CRUD operations               |
| Skills API   | `controllers/SkillsController.ts`   | Skill management                       |
| MCP Routes   | `routes/mcpRoutes.ts`               | MCP endpoint definitions               |
| WebSocket    | `websocket/WebSocketManager.ts`     | Real-time communication                |
| Middleware   | `middleware/`                       | Auth, validation, security, rate-limit |

---

## CONVENTIONS

Same as root.

---

## ANTI-PATTERNS (THIS SUBDIR)

- **String-matching error handling**: ProviderController and ModelController use `error.message.includes('not found')` instead of `AppError`. This fragile pattern should be replaced with proper typed error handling.
