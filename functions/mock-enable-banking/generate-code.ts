import type { EBEnv } from "../lib/enable-banking";

interface MockEnv extends EBEnv {
  ENVIRONMENT?: string;
}

interface GenerateCodeBody {
  aspsp_name: string;
  aspsp_country: string;
  redirect_url: string;
  valid_until: string;
}

export const onRequestPost: PagesFunction<MockEnv> = async (context) => {
  if (context.env.ENVIRONMENT === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const { env } = context;
  const body = (await context.request.json()) as GenerateCodeBody;
  const code = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO mock_enable_banking_auth_codes (code, aspsp_name, aspsp_country, redirect_url, valid_until)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(code, body.aspsp_name, body.aspsp_country, body.redirect_url, body.valid_until)
    .run();

  return Response.json({ code });
};
