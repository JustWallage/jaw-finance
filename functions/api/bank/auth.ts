import { ebFetch, getUserEmail, type EBEnv } from "../../lib/enable-banking";
import { signState } from "../../lib/oauth-state";
import { enforceRateLimit } from "../../lib/rate-limit";

interface AuthRequest {
  aspsp: { name: string; country: string };
}

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const userEmail = getUserEmail(context.request, env);
    const limited = await enforceRateLimit(env.DB, userEmail, "bank-auth", 20, 3600);
    if (limited) return limited;

    const body = (await context.request.json()) as AuthRequest;
    const validUntil = new Date(
      Date.now() + 90 * 24 * 60 * 60 * 1000,
    ).toISOString();
    if (!env.STATE_SECRET) {
      console.error("[bank/auth] STATE_SECRET is not configured");
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
    const state = await signState({ email: userEmail }, env.STATE_SECRET);

    const res = await ebFetch("/auth", env, {
      method: "POST",
      body: JSON.stringify({
        access: { valid_until: validUntil },
        aspsp: body.aspsp,
        state,
        redirect_url: env.ENABLE_BANKING_CALLBACK_URL,
        psu_type: "personal",
      }),
    });

    if (!res.ok) {
      console.error(`[bank/auth] Enable Banking auth failed (${res.status}):`, await res.text());
      return Response.json(
        { error: "Bank authorization failed" },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      url: string;
      authorization_id: string;
    };
    return Response.json({ url: data.url });
  } catch (err) {
    console.error("[bank/auth] Error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
};
