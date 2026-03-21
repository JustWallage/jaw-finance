const BUNQ_BASE = "https://public-api.sandbox.bunq.com";

interface Env {
  DB: D1Database;
  BUNQ_API_KEY_SANDBOX: string;
  BUNQ_PRIVATE_KEY_SANDBOX: string;
  BUNQ_INSTALLATION_TOKEN_SANDBOX: string;
  BUNQ_SERVER_PUBLIC_KEY_SANDBOX: string;
}

interface SessionRow {
  session_token: string;
  user_id: number;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const base64 = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}
async function signBody(privateKeyPem: string, body: string): Promise<string> {
  const key = await importPrivateKey(privateKeyPem);
  const data = new TextEncoder().encode(body);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// ---------------------------------------------------------------------------
// Bunq API helpers
// ---------------------------------------------------------------------------
function bunqHeaders(authToken: string, signature: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Bunq-Client-Authentication": authToken,
    "X-Bunq-Client-Signature": signature,
    "X-Bunq-Language": "en_US",
    "X-Bunq-Region": "en_US",
    "X-Bunq-Geolocation": "0 0 0 0 000",
    "Cache-Control": "no-cache",
    "User-Agent": "jaw-finance/1.0",
  };
}

async function createSession(
  env: Env,
): Promise<{ token: string; userId: number; expiresAt: Date }> {
  const body = JSON.stringify({ secret: env.BUNQ_API_KEY_SANDBOX });
  const signature = await signBody(env.BUNQ_PRIVATE_KEY_SANDBOX, body);
  const res = await fetch(`${BUNQ_BASE}/v1/session-server`, {
    method: "POST",
    headers: bunqHeaders(env.BUNQ_INSTALLATION_TOKEN_SANDBOX, signature),
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`bunq session-server ${res.status}: ${text}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as { Response: any[] };
  const responses = data.Response;
  // Response[1] is UserPerson or UserCompany
  const userEntry = responses[1] as Record<string, { id: number }>;
  const userKey = Object.keys(userEntry)[0]; // "UserPerson" | "UserCompany"
  const userId = userEntry[userKey].id;
  // Response[2] is Token
  const tokenEntry = responses[2] as { Token: { token: string } };
  const token = tokenEntry.Token.token;
  // Sessions expire after 1 hour by default in bunq sandbox
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  return { token, userId, expiresAt };
}

// ---------------------------------------------------------------------------
// Session cache
// ---------------------------------------------------------------------------
async function getValidSession(
  db: D1Database,
): Promise<SessionRow | null> {
  const row = await db
    .prepare(
      "SELECT session_token, user_id, expires_at FROM bunq_session_cache ORDER BY id DESC LIMIT 1",
    )
    .first<SessionRow>();
  if (!row) return null;
  const expiresAt = new Date(row.expires_at);
  // Give a 60-second buffer before actual expiry
  if (expiresAt.getTime() - 60_000 < Date.now()) return null;
  return row;
}
async function saveSession(
  db: D1Database,
  token: string,
  userId: number,
  expiresAt: Date,
): Promise<void> {
  // Keep only the latest session; delete old rows first
  await db.prepare("DELETE FROM bunq_session_cache").run();
  await db
    .prepare(
      "INSERT INTO bunq_session_cache (session_token, user_id, expires_at) VALUES (?, ?, ?)",
    )
    .bind(token, userId, expiresAt.toISOString())
    .run();
}

// ---------------------------------------------------------------------------
// Payments fetch
// ---------------------------------------------------------------------------
async function fetchTransactions(
  env: Env,
  sessionToken: string,
  userId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  // Fetch monetary accounts to find the primary active one
  const maBody = "";
  const maSig = await signBody(env.BUNQ_PRIVATE_KEY_SANDBOX, maBody);
  const maRes = await fetch(
    `${BUNQ_BASE}/v1/user/${userId}/monetary-account`,
    { headers: bunqHeaders(sessionToken, maSig) },
  );
  if (!maRes.ok) {
    const text = await maRes.text();
    throw new Error(`bunq monetary-account ${maRes.status}: ${text}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maData = (await maRes.json()) as { Response: any[] };
  // Find first active MonetaryAccountBank
  let accountId: number | null = null;
  for (const entry of maData.Response) {
    const bank = (entry as Record<string, { id: number; status?: string }>)[
      "MonetaryAccountBank"
    ];
    if (bank && bank.status === "ACTIVE") {
      accountId = bank.id;
      break;
    }
  }
  if (accountId === null) {
    throw new Error("No active monetary account found");
  }
  // Fetch payments — bunq returns newest first; we filter last 24 h client-side
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pBody = "";
  const pSig = await signBody(env.BUNQ_PRIVATE_KEY_SANDBOX, pBody);
  const pRes = await fetch(
    `${BUNQ_BASE}/v1/user/${userId}/monetary-account/${accountId}/payment?count=200`,
    { headers: bunqHeaders(sessionToken, pSig) },
  );
  if (!pRes.ok) {
    const text = await pRes.text();
    throw new Error(`bunq payment ${pRes.status}: ${text}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pData = (await pRes.json()) as { Response: any[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pData.Response.filter((entry: any) => {
    const payment = entry["Payment"];
    if (!payment) return false;
    const created = new Date(payment.created);
    return created >= cutoff;
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export const onRequest: PagesFunction<Env> = async (context) => {
  const { env } = context;
  try {
    // 1. Get or create a valid session
    let session = await getValidSession(env.DB);
    if (!session) {
      const created = await createSession(env);
      await saveSession(env.DB, created.token, created.userId, created.expiresAt);
      session = {
        session_token: created.token,
        user_id: created.userId,
        expires_at: created.expiresAt.toISOString(),
      };
    }
    // 2. Fetch the last 24 hours of transactions
    const transactions = await fetchTransactions(
      env,
      session.session_token,
      session.user_id,
    );
    return new Response(JSON.stringify({ transactions }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[bunq/transactions]", message);
    // Surface bunq-specific status codes when available
    const statusMatch = message.match(/bunq \w[\w-]* (\d{3}):/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
};
