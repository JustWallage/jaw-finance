# bunq API Context Bootstrap

This script registers a new device installation with the bunq API and extracts
the underlying cryptographic material so it can be stored as GitHub Secrets
for Cloudflare Workers to use.

## Prerequisites

* Python 3.9+
* A bunq **Wildcard-IP** API key (Sandbox or Production)

## Setup

```bash
# 1. Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt
```

## Running the script

```bash
# Sandbox (default)
BUNQ_API_KEY="<your-sandbox-api-key>" python setup_context.py

# Production
BUNQ_API_KEY="<your-production-api-key>" BUNQ_ENVIRONMENT=PRODUCTION python setup_context.py

# All options via CLI flags
python setup_context.py \
  --api-key "<your-api-key>" \
  --environment PRODUCTION \
  --device-description "jaw-finance bootstrap"
```

> **Tip:** To avoid leaking secrets via shell history or terminal scrollback,
> redirect stdout to a file with restricted permissions:
> ```bash
> python setup_context.py > secrets.txt && chmod 600 secrets.txt
> ```
> Then open `secrets.txt`, copy the values into GitHub Secrets, and **delete the file**.

## Output

The script prints three values to stdout:

```
BUNQ_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----"

BUNQ_SERVER_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----"

BUNQ_INSTALLATION_TOKEN="<token>"
```

## Storing the secrets in GitHub

1. Go to your repository → **Settings** → **Secrets and variables** → **Actions**.
2. Create the following **Repository Secrets**, pasting the exact values printed
   by the script (including the `-----BEGIN …-----` / `-----END …-----` lines):

   | Secret name               | Value from script                  |
   |---------------------------|------------------------------------|
   | `BUNQ_PRIVATE_KEY`        | The full PEM-encoded private key   |
   | `BUNQ_SERVER_PUBLIC_KEY`  | The full PEM-encoded public key    |
   | `BUNQ_INSTALLATION_TOKEN` | The plain installation token string|

> **Note:** The Cloudflare Worker Terraform/deployment code will handle injecting
> these secrets into the Worker environment at deploy time. You do not need to
> configure anything else here.

## Security notes

* Never commit the `bunq.conf` file or any of the secret values to version control.
* The generated private key grants full API access. Treat it like a password.
* Sandbox keys cannot be used against the Production API and vice versa.
