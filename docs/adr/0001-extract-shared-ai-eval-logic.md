# Extract shared AI evaluation logic into library modules

We consolidated duplicated AI evaluation logic from `evaluate.ts`, `evaluate-batch.ts`, and `chat.ts` into three focused library modules:

- **`lib/ai-response.ts`** — Workers AI SDK response unwrapping and Zod-validated JSON parsing. Handles multiple response formats (Cloudflare's `response` field, OpenAI-compatible `choices[0].message.content`).
- **`lib/ai-prompt-building.ts`** — Tag sanitization, the 4-stage filtering pipeline, prompt construction, and shared constants (`SYSTEM_PROMPT`, `MAX_NEW_TAGS`).
- **`lib/tag-utils.ts`** (extended) — Added `fetchHistoricalTagFrequencies` for RAG context queries.

Previously, `isReservedAutoPath`, `sanitizePath`, `formatTagForPrompt`, the filtering pipeline, RAG queries, and AI response parsing were each duplicated across 2–3 endpoint files. Model response format bugs (the `response`-as-object vs `choices[0].message.content` issue) had to be fixed in every file independently.
