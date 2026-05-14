import { z } from "zod/v4";
import type { QueryObject } from "./query-utils";

// --- Zod Schemas ---

const SingleEvalResponseSchema = z.object({
  reasoning: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const BatchEvalItemSchema = z.object({
  id: z.string(),
  reasoning: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const BatchEvalResponseSchema = z.array(BatchEvalItemSchema);

// --- Public Types ---

export interface ParsedEvalResponse {
  reasoning: string | null;
  tags: string[];
}

export interface BatchEvalItem {
  id: string;
  reasoning: string | null;
  tags: string[];
}

// --- Internal Helpers ---

function extractAIText(aiResp: unknown): string {
  const resp = (aiResp as { response?: unknown }).response;
  if (typeof resp === "string") return resp;
  if (Array.isArray(resp)) return JSON.stringify(resp);
  if (typeof resp === "object" && resp !== null) return JSON.stringify(resp);
  const choices = (
    aiResp as {
      choices?: {
        message?: { content?: string | null; reasoning_content?: string };
      }[];
    }
  ).choices;
  if (typeof choices?.[0]?.message?.content === "string")
    return choices[0].message.content;
  if (typeof choices?.[0]?.message?.reasoning_content === "string")
    return choices[0].message.reasoning_content;
  return JSON.stringify(aiResp);
}

function stripCodeBlocks(text: string): string {
  return text
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
}

// --- Public API ---

/** Parse a single-evaluate AI response into {reasoning, tags}. */
export function parseSingleEvalResponse(aiResp: unknown): ParsedEvalResponse {
  const text = stripCodeBlocks(extractAIText(aiResp));
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { reasoning: null, tags: [] };
  try {
    const json = JSON.parse(match[0]);
    const result = SingleEvalResponseSchema.safeParse(json);
    if (!result.success) return { reasoning: null, tags: [] };
    return {
      reasoning: result.data.reasoning?.trim() || null,
      tags: result.data.tags,
    };
  } catch {
    return { reasoning: null, tags: [] };
  }
}

/** Parse a batch-evaluate AI response into an array of {id, reasoning, tags}. */
export function parseBatchEvalResponse(aiResp: unknown): BatchEvalItem[] {
  const text = stripCodeBlocks(extractAIText(aiResp));
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const json = JSON.parse(match[0]);
    const result = BatchEvalResponseSchema.safeParse(json);
    if (!result.success) return [];
    return result.data.map((item) => ({
      id: item.id,
      reasoning: item.reasoning?.trim() || null,
      tags: item.tags,
    }));
  } catch {
    return [];
  }
}

/** Extract text from a Workers AI response (used by chat endpoint). */
export { extractAIText };

/** Parse a chat query AI response into an array of QueryObjects. */
export function parseQueryArray(aiResp: unknown): QueryObject[] | null {
  const text = stripCodeBlocks(extractAIText(aiResp));
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (q: unknown): q is QueryObject =>
        typeof q === "object" &&
        q !== null &&
        Array.isArray((q as QueryObject).tagGlobs),
    );
  } catch {
    return null;
  }
}
