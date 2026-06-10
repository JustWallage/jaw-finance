import { ebFetch, getUserEmail, type EBEnv } from "../../lib/enable-banking";

interface ASPSPData {
  name: string;
  country: string;
  logo: string;
  bic?: string;
  beta: boolean;
}

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  try {
    getUserEmail(context.request, env); // auth check

    const res = await ebFetch("/aspsps?psu_type=personal", env);
    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: `Failed to fetch ASPSPs: ${text}` },
        { status: res.status },
      );
    }

    const data = (await res.json()) as { aspsps: ASPSPData[] };
    const aspsps = data.aspsps.map((a) => ({
      name: a.name,
      country: a.country,
      logo: a.logo,
      bic: a.bic ?? null,
    }));

    return Response.json({ aspsps });
  } catch (err) {
    console.error("[aspsps] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
};
