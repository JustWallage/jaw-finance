import type { EBEnv } from "../lib/enable-banking";
import type { MockAuthCodeRow } from "../../db/types";

interface MockEnv extends EBEnv {
  ENVIRONMENT?: string;
}

interface SessionBody {
  code: string;
}

export const onRequestPost: PagesFunction<MockEnv> = async (context) => {
  if (context.env.ENVIRONMENT === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const { env } = context;
  const body = (await context.request.json()) as SessionBody;

  const row = await env.DB.prepare(
    "SELECT * FROM mock_enable_banking_auth_codes WHERE code = ? AND used = 0",
  )
    .bind(body.code)
    .first<MockAuthCodeRow>();

  if (!row) {
    return Response.json(
      {
        message: "Wrong authorization code provided",
        error: "WRONG_AUTHORIZATION_CODE",
      },
      { status: 400 },
    );
  }

  await env.DB.prepare(
    "UPDATE mock_enable_banking_auth_codes SET used = 1 WHERE code = ?",
  )
    .bind(body.code)
    .run();

  const sessionId = "mock-session-id-001";
  const userPrefix = row.state
    ? (() => {
        try {
          const s = JSON.parse(atob(row.state)) as { email?: string };
          return s.email?.split("@")[0] ?? "unknown";
        } catch {
          return "unknown";
        }
      })()
    : "unknown";
  const accountUid1 = `mock-account-uid-${userPrefix}`;
  const iban1 = "NL00MOCK0123456789";
  const accountUid2 = `mock-account-uid-${userPrefix}-savings`;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO mock_enable_banking_sessions (session_id, account_uid, aspsp_name, aspsp_country, iban, valid_until)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, account_uid) DO UPDATE SET
         valid_until = excluded.valid_until,
         aspsp_name = excluded.aspsp_name,
         aspsp_country = excluded.aspsp_country`,
    ).bind(
      sessionId,
      accountUid1,
      row.aspsp_name,
      row.aspsp_country,
      iban1,
      row.valid_until,
    ),
    env.DB.prepare(
      `INSERT INTO mock_enable_banking_sessions (session_id, account_uid, aspsp_name, aspsp_country, iban, valid_until)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, account_uid) DO UPDATE SET
         valid_until = excluded.valid_until,
         aspsp_name = excluded.aspsp_name,
         aspsp_country = excluded.aspsp_country`,
    ).bind(
      sessionId,
      accountUid2,
      row.aspsp_name,
      row.aspsp_country,
      null,
      row.valid_until,
    ),
  ]);

  return Response.json({
    session_id: sessionId,
    accounts: [
      {
        uid: accountUid1,
        account_id: { iban: iban1 },
        name: "Mock Current Account",
        currency: "EUR",
        cash_account_type: "CACC",
        identification_hash: "mock-hash-1",
        identification_hashes: ["mock-hash-1"],
      },
      {
        uid: accountUid2,
        account_id: {},
        name: "Mock Savings Account",
        currency: "EUR",
        cash_account_type: "SVGS",
        identification_hash: "mock-hash-2",
        identification_hashes: ["mock-hash-2"],
      },
    ],
    aspsp: { name: row.aspsp_name, country: row.aspsp_country },
    psu_type: "personal",
    access: { valid_until: row.valid_until },
  });
};
