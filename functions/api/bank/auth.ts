import { ebFetch, type EBEnv } from "../../lib/enable-banking";

interface AuthRequest {
  aspsp: { name: string; country: string };
}

export const onRequestPost: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    const body = (await context.request.json()) as AuthRequest;
    const validUntil = new Date(
      Date.now() + 90 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const state = crypto.randomUUID();

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
      const text = await res.text();
      return Response.json(
        { error: `Enable Banking auth failed: ${text}` },
        { status: res.status },
      );
    }

    const data = (await res.json()) as { url: string; authorization_id: string };
    return Response.json({ url: data.url });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
