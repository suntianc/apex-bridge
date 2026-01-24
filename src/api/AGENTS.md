# AGENTS.md

**Generated:** 2026-01-17
**Directory:** src/api

---

## OVERVIEW

REST API layer - Controllers, Middleware, WebSocket, Routes.

---

## WHERE TO LOOK

| Component    | Path                                 | Role                                   |
| ------------ | ------------------------------------ | -------------------------------------- |
| Chat API     | `controllers/chat/ChatController.ts` | Chat completions, streaming            |
| Model API    | `controllers/ModelController.ts`     | Model CRUD operations                  |
| Provider API | `controllers/ProviderController.ts`  | Provider CRUD operations               |
| Skills API   | `controllers/SkillsController.ts`    | Skill management                       |
| MCP Routes   | `routes/mcpRoutes.ts`                | MCP endpoint definitions               |
| WebSocket    | `websocket/WebSocketManager.ts`      | Real-time communication                |
| Middleware   | `middleware/`                        | Auth, validation, security, rate-limit |

---

## CONVENTIONS

Same as root.

---

## ANTI-PATTERNS (THIS SUBDIR)

- **String-matching error handling**: ProviderController and ModelController use `error.message.includes('not found')` instead of `AppError`. This fragile pattern should be replaced with proper typed error handling.

---

## HTTP RESPONSE PATTERNS

**ALWAYS** use `src/utils/http-response.ts` utilities for API responses:

| Utility                                             | Status Code | Use Case                        |
| --------------------------------------------------- | ----------- | ------------------------------- |
| `sendOk(res, data)`                                 | 200         | Successful GET/GET all requests |
| `sendCreated(res, data)`                            | 201         | Successful POST creation        |
| `badRequest(res, message, details?)`                | 400         | Invalid input parameters        |
| `unauthorized(res, message)`                        | 401         | Authentication required         |
| `forbidden(res, message)`                           | 403         | Permission denied               |
| `notFound(res, message)`                            | 404         | Resource not found              |
| `conflict(res, message)`                            | 409         | Duplicate/constraint violation  |
| `unprocessableEntity(res, message)`                 | 422         | Validation error                |
| `tooManyRequests(res, message)`                     | 429         | Rate limiting                   |
| `serverError(res, error, context)`                  | 500         | Internal server error           |
| `dynamicStatus(res, status, data)`                  | Custom      | Dynamic status codes            |
| `handleErrorWithAutoDetection(res, error, context)` | Auto        | Type-safe error detection       |

**Exceptions (Allowed)**:

- **SSE streaming**: Use `res.write()` in `StreamResponseHandler`
- **Non-JSON responses**: Prometheus metrics, OpenAPI specs

**Enforcement**:

- ESLint rule `no-restricted-syntax` catches direct `res.json()` usage
- Violation message: "Use http-response utility instead of direct res.json()"
