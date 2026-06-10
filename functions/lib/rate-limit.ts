/** Fixed-window per-user rate limiting backed by D1 (no KV binding exists).
 *  Returns a 429 Response when the limit is exceeded, null otherwise. */
export async function enforceRateLimit(
  db: D1Database,
  userEmail: string,
  route: string,
  limit: number,
  windowSeconds: number,
): Promise<Response | null> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = nowSeconds - (nowSeconds % windowSeconds);

  const row = await db
    .prepare(
      `INSERT INTO rate_limits (user_email, route, window_start)
       VALUES (?, ?, ?)
       ON CONFLICT(user_email, route, window_start)
       DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(userEmail, route, windowStart)
    .first<{ count: number }>();

  if (row && row.count > limit) {
    return Response.json(
      { error: "Rate limit exceeded, try again later" },
      { status: 429 },
    );
  }

  if (row?.count === 1) {
    await db
      .prepare("DELETE FROM rate_limits WHERE window_start < ?")
      .bind(nowSeconds - 86400)
      .run();
  }

  return null;
}
