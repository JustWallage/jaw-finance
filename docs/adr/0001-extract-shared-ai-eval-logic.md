# 0001 — Extract shared AI evaluation logic into library modules

- Status: accepted
- Date: 2026-05-13

## Context

Three Pages Function endpoints call Workers AI: single-transaction evaluation
(`functions/api/transactions/[id]/evaluate.ts`), batch evaluation
(`functions/api/transactions/evaluate-batch.ts`), and natural-language chat
(`functions/api/chat.ts`). They grew independently and ended up duplicating
roughly 80% of their logic across 2–3 files each:

- tag path sanitization and reserved-path checks (`sanitizePath`, `isReservedAutoPath`)
- formatting existing tags (with reasoning) for prompts (`formatTagForPrompt`)
- the 4-stage suggestion filtering pipeline (drop ancestors of deeper paths,
  drop rejected paths and descendants, cap new paths)
- historical tag-frequency RAG queries against D1
- Workers AI response unwrapping and JSON parsing — the model response arrives
  either as Cloudflare's `response` field or as OpenAI-compatible
  `choices[0].message.content`, and a format-handling bug had to be fixed in
  every file independently

## Decision

We will extract the shared AI-evaluation logic into focused modules under
`functions/lib`:

- `lib/ai-response.ts` — response unwrapping and Zod-validated JSON parsing
  for both single and batch response shapes
- `lib/ai-prompt-building.ts` — tag sanitization, the filtering pipeline,
  prompt construction, and shared constants (`SYSTEM_PROMPT`, `MAX_NEW_TAGS`)
- `lib/tag-utils.ts` (extended) — `fetchHistoricalTagFrequencies` for RAG
  context, alongside the existing consolidated tag assignment

Endpoints keep only orchestration: load context, build prompt, call the model,
filter, assign.

## Alternatives considered

- **Keep the duplication.** Rejected: the copies had already diverged once
  (the response-format bug was fixed per file), and a third consumer (chat)
  made the cost compound.
- **Merge into a single evaluation endpoint/handler serving single and batch.**
  Rejected: the endpoints differ in prompt shape, response schema, and
  iteration structure; one handler would become a branching monolith.
- **A class-based "AI service" abstraction.** Rejected: plain functions are
  sufficient for stateless Pages Functions and keep the code shorter.

## Consequences

- Good: one fix point for parsing/filtering bugs; endpoints shrink to readable
  orchestration; the batch endpoint reuses the exact filters of the single one,
  so behaviour cannot silently diverge.
- Bad: the lib modules now have three callers, so any signature or behaviour
  change requires checking all of them; one extra layer of indirection when
  reading an endpoint top to bottom.
