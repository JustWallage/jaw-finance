# Refactor: Extract shared AI evaluation logic into library modules

## What to build

Consolidate duplicated logic across `evaluate.ts`, `evaluate-batch.ts`, and `chat.ts` into focused library modules. No functional changes — same endpoints, same behavior, same responses.

### Vertical slices (in order):

**1. Create `functions/lib/ai-response.ts`**
- Extract `extractAIText` (handles Workers AI `response` field + OpenAI `choices[0].message.content` formats)
- Extract `parseAIResponse` → rename to `parseSingleEvalResponse(aiResp): ParsedAIResponse`
- Extract `parseBatchAIResponse` → rename to `parseBatchEvalResponse(aiResp): BatchAIItem[]`
- Add Zod schemas (`SingleEvalResponseSchema`, `BatchEvalItemSchema`) to replace manual `typeof` guards
- Install `zod` dependency
- Update `evaluate.ts`, `evaluate-batch.ts`, and `chat.ts` to import from here

**2. Create `functions/lib/ai-prompt-building.ts`**
- Extract `isReservedAutoPath`, `sanitizePath`, `formatTagForPrompt` (currently duplicated in evaluate + evaluate-batch)
- Extract `filterSuggestedTags(rawTags, rejected, existing, alreadyAssigned, maxNew): string[]` (the 4-stage pipeline, currently duplicated)
- Extract `buildSinglePrompt` and `buildBatchPrompt`
- Move `SYSTEM_PROMPT`, `BATCH_SYSTEM_PROMPT`, `MAX_NEW_TAGS` here
- Update `evaluate.ts` and `evaluate-batch.ts` to import from here

**3. Move `fetchHistoricalTagFrequencies` into `functions/lib/tag-utils.ts`**
- It's a DB query for RAG context — belongs alongside existing DB tag operations
- Currently duplicated in evaluate + evaluate-batch (with slightly different signatures for single vs batch exclusion)
- Unify into a single signature that accepts `number | number[]` for exclusion

**4. Slim down `functions/api/transactions/[id]/prompt.ts`**
- Keep only `exampleTagList` (the long example array)
- Rename file to `example-tags.ts`

**5. Delete `functions/lib/auto-tag.ts`**
- Dead code, not imported anywhere

## Acceptance criteria

- [ ] No duplicated functions across evaluate, evaluate-batch, and chat endpoints
- [ ] Zod validates AI response JSON (single + batch)
- [ ] `pnpm check` passes
- [ ] `pnpm build` succeeds
- [ ] All E2E tests pass
- [ ] No functional changes — same API responses, same behavior

## Blocked by

None — can start immediately.

## References

- ADR: `docs/adr/0001-extract-shared-ai-eval-logic.md`
- Domain glossary: `CONTEXT.md`
