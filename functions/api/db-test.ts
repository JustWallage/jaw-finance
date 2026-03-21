interface Env {
  DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const result = await context.env.DB.prepare("SELECT 1 AS status").first<{
    status: number;
  }>();
  return new Response(JSON.stringify({ status: "ok", db: result }), {
    headers: { "Content-Type": "application/json" },
  });
};
