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
      { message: "Wrong authorization code provided", error: "WRONG_AUTHORIZATION_CODE" },
      { status: 400 },
    );
  }

  await env.DB.prepare(
    "UPDATE mock_enable_banking_auth_codes SET used = 1 WHERE code = ?",
  )
    .bind(body.code)
    .run();

  const sessionId = crypto.randomUUID();
  const accountUid = crypto.randomUUID();
  const iban = "NL00MOCK0123456789";

  await env.DB.prepare(
    `INSERT INTO mock_enable_banking_sessions (session_id, account_uid, aspsp_name, aspsp_country, iban, valid_until)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(sessionId, accountUid, row.aspsp_name, row.aspsp_country, iban, row.valid_until)
    .run();

  return Response.json({
    session_id: sessionId,
    accounts: [
      {
        uid: accountUid,
        account_id: { iban },
        name: "Mock Current Account",
        currency: "EUR",
        cash_account_type: "CACC",
        identification_hash: "mock-hash-1",
        identification_hashes: ["mock-hash-1"],
      },
    ],
    aspsp: { name: row.aspsp_name, country: row.aspsp_country },
    psu_type: "personal",
    access: { valid_until: row.valid_until },
  });
};
