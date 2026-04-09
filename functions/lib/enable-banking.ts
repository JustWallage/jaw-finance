export interface EBEnv {
  DB: D1Database;
  ENABLE_BANKING_APP_ID: string;
  ENABLE_BANKING_SECRET: string;
  ENABLE_BANKING_API_URL: string;
  ENABLE_BANKING_CALLBACK_URL: string;
  ENVIRONMENT?: string;
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

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

async function createJWT(
  appId: string,
  privateKeyPem: string,
): Promise<string> {
  const header = base64urlEncode(
    JSON.stringify({ typ: "JWT", alg: "RS256", kid: appId }),
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = base64urlEncode(
    JSON.stringify({
      iss: "enablebanking.com",
      aud: "api.enablebanking.com",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);
  const key = await importPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, signingInput);
  return `${header}.${payload}.${base64url(sig)}`;
}

export async function ebFetch(
  path: string,
  env: EBEnv,
  options: RequestInit = {},
): Promise<Response> {
  const jwt = await createJWT(
    env.ENABLE_BANKING_APP_ID,
    env.ENABLE_BANKING_SECRET,
  );
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${jwt}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");
  const baseUrl = env.ENABLE_BANKING_API_URL;
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

/** Extract authenticated user email from Cloudflare Access header.
 *  In staging, also accepts X-Test-User-Email (CF Access service tokens
 *  don't populate the email header). */
export function getUserEmail(request: Request, environment?: string): string {
  const email =
    request.headers.get("Cf-Access-Authenticated-User-Email") ??
    (environment === "staging"
      ? request.headers.get("X-Test-User-Email")
      : null);
  if (!email) throw new Error("Missing user identity");
  return email;
}
