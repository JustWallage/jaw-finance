import type { EBEnv } from "../lib/enable-banking";

interface MockEnv extends EBEnv {
  ENVIRONMENT?: string;
}

interface AuthBody {
  access: { valid_until: string };
  aspsp: { name: string; country: string };
  state: string;
  redirect_url: string;
  psu_type: string;
}

export const onRequestPost: PagesFunction<MockEnv> = async (context) => {
  if (context.env.ENVIRONMENT === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const { env } = context;
  const body = (await context.request.json()) as AuthBody;
  const authorizationId = crypto.randomUUID();
  const origin = new URL(context.request.url).origin;

  const consentUrl = new URL(`${origin}/mock-enable-banking/consent`);
  consentUrl.searchParams.set("redirect_url", body.redirect_url);
  consentUrl.searchParams.set("state", body.state);
  consentUrl.searchParams.set("aspsp_name", body.aspsp.name);
  consentUrl.searchParams.set("aspsp_country", body.aspsp.country);
  consentUrl.searchParams.set("valid_until", body.access.valid_until);

  return Response.json({
    url: consentUrl.toString(),
    authorization_id: authorizationId,
    psu_id_hash: "mock-hash",
  });
};
