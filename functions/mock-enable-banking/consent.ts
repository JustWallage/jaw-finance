import type { EBEnv } from "../lib/enable-banking";

interface MockEnv extends EBEnv {
  ENVIRONMENT?: string;
}

export const onRequestGet: PagesFunction<MockEnv> = async (context) => {
  if (context.env.ENVIRONMENT === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const { env } = context;
  const url = new URL(context.request.url);
  const redirectUrl = url.searchParams.get("redirect_url") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const aspspName = url.searchParams.get("aspsp_name") ?? "";
  const aspspCountry = url.searchParams.get("aspsp_country") ?? "";
  const validUntil = url.searchParams.get("valid_until") ?? "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mock Bank Authentication</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 20px; background: #f5f5f5; }
    h1 { font-size: 1.5rem; }
    p { color: #666; }
    .buttons { display: flex; flex-direction: column; gap: 12px; margin-top: 24px; }
    button { padding: 12px 24px; font-size: 1rem; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
    .success { background: #22c55e; color: white; }
    .cancel { background: #eab308; color: white; }
    .failure { background: #ef4444; color: white; }
  </style>
</head>
<body>
  <h1>Mock Bank Authentication</h1>
  <p>Bank: <strong>${aspspName}</strong> (${aspspCountry})</p>
  <p>Choose how to respond:</p>
  <div class="buttons">
    <button class="success" data-testid="simulate-success" onclick="simulateSuccess()">Simulate Success</button>
    <button class="cancel" data-testid="simulate-cancel" onclick="simulateCancel()">Simulate Cancel</button>
    <button class="failure" data-testid="simulate-failure" onclick="simulateFailure()">Simulate Failure</button>
  </div>
  <script>
    async function simulateSuccess() {
      const res = await fetch('/mock-enable-banking/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aspsp_name: ${JSON.stringify(aspspName)},
          aspsp_country: ${JSON.stringify(aspspCountry)},
          redirect_url: ${JSON.stringify(redirectUrl)},
          valid_until: ${JSON.stringify(validUntil)},
          state: ${JSON.stringify(state)}
        })
      });
      const data = await res.json();
      const url = new URL(${JSON.stringify(redirectUrl)});
      url.searchParams.set('code', data.code);
      url.searchParams.set('state', ${JSON.stringify(state)});
      window.location.href = url.toString();
    }
    function simulateCancel() {
      const url = new URL(${JSON.stringify(redirectUrl)});
      url.searchParams.set('error', 'access_denied');
      url.searchParams.set('error_description', 'Denied data sharing consent');
      url.searchParams.set('state', ${JSON.stringify(state)});
      window.location.href = url.toString();
    }
    function simulateFailure() {
      const url = new URL(${JSON.stringify(redirectUrl)});
      url.searchParams.set('error', 'server_error');
      url.searchParams.set('error_description', 'ASPSP connection failed');
      url.searchParams.set('state', ${JSON.stringify(state)});
      window.location.href = url.toString();
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
