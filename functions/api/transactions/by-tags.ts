import { getUserEmail, type EBEnv } from "../../lib/enable-banking";
import { executeTagQuery, type QueryObject } from "../../lib/query-utils";

interface ByTagsRequest {
  paths?: string[];
  queries?: QueryObject[];
  account_uid?: string;
}

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
    const body = (await context.request.json()) as ByTagsRequest;

    // Backward compat: convert legacy `paths` to queries with glob patterns
    const queries = body.queries
      ?? (body.paths
        ? [{ tagGlobs: body.paths.flatMap((p) => [p, p + "/*"]) }]
        : null);
    if (!queries || queries.length === 0) {
      return Response.json(
        { error: "queries array is required" },
        { status: 400 },
      );
    }

    const hasValidGlobs = queries.some((q) => q.tagGlobs && q.tagGlobs.length > 0);
    if (!hasValidGlobs) {
      return Response.json(
        { error: "at least one query with tagGlobs is required" },
        { status: 400 },
      );
    }

    const result = await executeTagQuery(env.DB, userEmail, queries, body.account_uid);

    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
