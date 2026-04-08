import { ebFetch, type EBEnv } from "../../lib/enable-banking";
import type { EBSessionResponse } from "../../../db/types";

export const onRequestGet: PagesFunction<EBEnv> = async (context) => {
  const { env } = context;
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const stateParam = url.searchParams.get("state");

  if (error) {
    const desc = url.searchParams.get("error_description") ?? error;
    return Response.redirect(
      `${url.origin}/?bank_error=${encodeURIComponent(desc)}`,
      302,
    );
  }

  if (!code || !stateParam) {
    return Response.redirect(
      `${url.origin}/?bank_error=${encodeURIComponent("Missing authorization code or state")}`,
      302,
    );
  }

  let userEmail: string;
  try {
    const state = JSON.parse(atob(stateParam)) as { email?: string };
    if (!state.email) throw new Error("Missing email in state");
    userEmail = state.email;
  } catch {
    return Response.redirect(
      `${url.origin}/?bank_error=${encodeURIComponent("Invalid state parameter")}`,
      302,
    );
  }

  try {
    const res = await ebFetch("/sessions", env, {
      method: "POST",
      body: JSON.stringify({ code }),
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.redirect(
        `${url.origin}/?bank_error=${encodeURIComponent(`Session creation failed: ${text}`)}`,
        302,
      );
    }

    const data = (await res.json()) as EBSessionResponse;

    for (const account of data.accounts) {
      if (!account.uid) continue;
      await env.DB.prepare(
        `INSERT INTO bank_connections (session_id, account_uid, aspsp_name, aspsp_country, iban, valid_until, user_email)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_uid) DO UPDATE SET
           session_id = excluded.session_id,
           valid_until = excluded.valid_until,
           user_email = excluded.user_email,
           updated_at = CURRENT_TIMESTAMP`,
      )
        .bind(
          data.session_id,
          account.uid,
          data.aspsp.name,
          data.aspsp.country,
          account.account_id?.iban ?? null,
          data.access.valid_until,
          userEmail,
        )
        .run();
    }

    return Response.redirect(`${url.origin}/?connected=true`, 302);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.redirect(
      `${url.origin}/?bank_error=${encodeURIComponent(msg)}`,
      302,
    );
  }
};
