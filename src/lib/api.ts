import { authHeaders } from "./auth-headers";

/** Fetch wrapper for /api/* calls: attaches identity headers, parses JSON,
 *  and throws an Error with the server's `error` message on non-OK responses. */
export async function apiFetch<T = unknown>(
  path: string,
  init?: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}
