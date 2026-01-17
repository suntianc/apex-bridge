# AGENTS.md

**Generated:** 2026-01-17
**Directory:** src/api/middleware

---

## OVERVIEW

HTTP middleware stack - Auth, Security, Validation, Rate-limiting.

---

## WHERE TO LOOK

| Component         | Path                                                      | Role                                            |
| ----------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Auth              | `authMiddleware.ts`                                       | API Key validation (Bearer token)               |
| Security Headers  | `securityHeadersMiddleware.ts`                            | Helmet.js + CSP (frame-ancestors: none)         |
| Sanitization      | `sanitizationMiddleware.ts`                               | XSS/SQLi prevention                             |
| Validation        | `validationMiddleware.ts`                                 | AJV JSON Schema validation                      |
| Custom Validators | `customValidators.ts`                                     | Business rule validators (API key, port)        |
| Rate-limit        | `rateLimitMiddleware.ts`                                  | Adaptive rate limiter (memory/Redis)            |
| Rate-limit Impl   | `rateLimit/`                                              | `inMemoryRateLimiter.ts`, `redisRateLimiter.ts` |
| Logging           | `auditLoggerMiddleware.ts`, `securityLoggerMiddleware.ts` | Request audit & security events                 |

---

## CONVENTIONS

Same as root.

---

## ANTI-PATTERNS (THIS SUBDIR)

- **frame-ancestors: ["'none'"]** - Strictly no iframe embedding allowed
- **object-src: ["'none'"]** - No object/embed elements allowed
- **API Key format check**: `authMiddleware.ts` uses config-based validation only (no JWT parsing)
