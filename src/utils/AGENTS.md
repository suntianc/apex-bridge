# AGENTS.md - src/utils

**Utilities** - Config (loader/validator/writer), Logger, Retry, Errors.

## WHERE TO LOOK

| Component  | Files                                                                                | Role                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Config** | `config-loader.ts`, `config-validator.ts`, `config-writer.ts`, `config-constants.ts` | ConfigLoader singleton reads/writes JSON with caching; ConfigValidator enforces structure with errors/warnings; ConfigWriter merges partial updates |
| **Logger** | `logger.ts`                                                                          | Winston logger, production caps at 'warn', colored console output                                                                                   |
| **Retry**  | `retry.ts`                                                                           | Exponential backoff with jitter, `defaultShouldRetry()` for 5xx/429/network errors, custom `shouldRetry` override                                   |
| **Errors** | `errors.ts`, `error-classifier.ts`                                                   | `AppError` class with ErrorCode enum; ErrorClassifier maps errors to 8 types (NETWORK_ERROR, TIMEOUT, RATE_LIMIT, etc.)                             |

## KEY PATTERNS

- **ConfigLoader**: Singleton pattern, caches config in memory, auto-creates default config on missing file
- **Retry**: `maxRetries=3` means 1 initial + 3 retries = 4 attempts; supports `withRetry(fn, config)` wrapper
- **ErrorClassifier**: Prioritizes error code → HTTP status → business names → message keywords; also estimates tokens

## CONVENTIONS

Same as root (2-space indent, single quotes, semicolons required).

## ANTI-PATTERNS

- **Config split**: `config/` AND `src/config/` directories both exist (confusing, prefer consolidating to `config/`)
- **Config split**: `src/utils/config/` also exists (additional confusion)
