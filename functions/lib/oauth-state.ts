/** HMAC-SHA256-signed OAuth state: base64url(payload).base64url(signature).
 *  The payload carries the user identity through the bank redirect, so the
 *  callback can trust it without a server-side session. */

interface StatePayload {
  email: string;
  nonce: string;
  iat: number;
}

const encoder = new TextEncoder();

function base64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signState(
  payload: { email: string },
  secret: string,
): Promise<string> {
  const full: StatePayload = {
    email: payload.email,
    nonce: crypto.randomUUID(),
    iat: Date.now(),
  };
  const body = base64urlEncode(encoder.encode(JSON.stringify(full)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64urlEncode(new Uint8Array(sig))}`;
}

export async function verifyState(
  state: string,
  secret: string,
  maxAgeMs = 60 * 60 * 1000,
): Promise<{ email: string } | null> {
  try {
    const parts = state.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlDecode(sig),
      encoder.encode(body),
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(base64urlDecode(body)),
    ) as StatePayload;
    if (!payload.email || typeof payload.iat !== "number") return null;
    if (Date.now() - payload.iat > maxAgeMs) return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
