# STRATEGIES

**Generated:** 2026-01-17
**Chat strategies** - ReAct (multi-round), SingleRound (fast)

---

## WHERE TO LOOK

| Task                  | File                     | Notes                                                         |
| --------------------- | ------------------------ | ------------------------------------------------------------- |
| Strategy interface    | `ChatStrategy.ts`        | Defines `prepare`, `execute`, `stream`, `supports`, `getName` |
| Multi-round reasoning | `ReActStrategy.ts`       | 50 iterations max, tool integration, auto-cleanup             |
| Fast single response  | `SingleRoundStrategy.ts` | Direct LLM call, no thinking loop                             |

---

## KEY DETAILS

- **ReActStrategy**: Uses `ReActEngine` for tool calling, tracks skill usage with 5-min auto-cleanup, supports streaming with detailed event types (`reasoning-start/delta/end`, `step-start/finish`, `tool_start/end`, `done`, `error`)
- **SingleRoundStrategy**: Simple wrapper around `LLMManager.chat()` and `streamChat()`, returns usage data
- Both strategies receive pre-processed messages (variable substitution done by ChatService)

---

## ANTI-PATTERNS (THIS SUBDIR)

- ✅ **usage tracking 已实现** (`ReActStrategy.ts:153-157`) - `usage` 字段在返回值中正确填充，包含 prompt_tokens、completion_tokens 和 total_tokens
