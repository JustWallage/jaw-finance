interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.env.ENVIRONMENT === "production") {
    return new Response("Not found", { status: 404 });
  }
  const result = await context.env.DB.prepare("SELECT 1 AS status").first<{
    status: number;
  }>();
  return new Response(JSON.stringify({ status: "ok", db: result }), {
    headers: { "Content-Type": "application/json" },
  });
};
