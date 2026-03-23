#!/usr/bin/env python3
"""
bunq API Context Bootstrap Script

Registers a new device installation with the bunq API and extracts the
underlying cryptographic material so it can be stored as GitHub Secrets
for use by Cloudflare Workers.

Usage:
    Set the required environment variables (or pass CLI arguments), then run:
        python setup_context.py

Environment variables:
    BUNQ_API_KEY         Required. A bunq Wildcard-IP API key.
    BUNQ_ENVIRONMENT     Optional. "SANDBOX" (default) or "PRODUCTION".

CLI arguments (override environment variables):
    --api-key            bunq API key
    --environment        "SANDBOX" or "PRODUCTION"
    --device-description Human-readable device name (default: "jaw-finance bootstrap")
"""

import argparse
import os
import sys

from bunq.sdk.context.api_context import ApiContext
from bunq.sdk.context.api_environment_type import ApiEnvironmentType
from bunq.sdk.security import security


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bootstrap a bunq API context and print secrets for GitHub."
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("BUNQ_API_KEY"),
        help="bunq Wildcard-IP API key (or set BUNQ_API_KEY env var)",
    )
    parser.add_argument(
        "--environment",
        default=os.environ.get("BUNQ_ENVIRONMENT", "SANDBOX").upper(),
        choices=["SANDBOX", "PRODUCTION"],
        help="API environment: SANDBOX or PRODUCTION (default: SANDBOX)",
    )
    parser.add_argument(
        "--device-description",
        default="jaw-finance bootstrap",
        help='Device description shown in the bunq app (default: "jaw-finance bootstrap")',
    )
    return parser.parse_args()


def resolve_environment(environment: str) -> ApiEnvironmentType:
    if environment == "PRODUCTION":
        return ApiEnvironmentType.PRODUCTION
    return ApiEnvironmentType.SANDBOX


def main() -> None:
    args = parse_args()

    if not args.api_key:
        print(
            "ERROR: bunq API key is required. "
            "Set the BUNQ_API_KEY environment variable or pass --api-key.",
            file=sys.stderr,
        )
        sys.exit(1)

    environment_type = resolve_environment(args.environment)

    print(f"Creating bunq API context ({args.environment})…", file=sys.stderr)

    api_context = ApiContext.create(
        environment_type,
        args.api_key,
        args.device_description,
        all_permitted_ip=["*"],
    )

    installation = api_context.installation_context
    private_key_pem: str = security.private_key_to_string(installation.private_key_client)
    server_public_key_pem: str = security.public_key_to_string(installation.public_key_server)
    installation_token: str = installation.token

    print(f"Done. Copy the values below into your GitHub Repository Secrets.\n", file=sys.stderr)
    print(
        "TIP: To avoid leaking secrets via shell history or terminal scrollback,\n"
        "     redirect stdout to a file with restricted permissions:\n"
        "       python setup_context.py > secrets.txt && chmod 600 secrets.txt\n"
        "     Then open secrets.txt, copy the values, and delete the file.\n",
        file=sys.stderr,
    )

    print(f'BUNQ_PRIVATE_KEY="{private_key_pem}"')
    print()
    print(f'BUNQ_SERVER_PUBLIC_KEY="{server_public_key_pem}"')
    print()
    print(f'BUNQ_INSTALLATION_TOKEN="{installation_token}"')


if __name__ == "__main__":
    main()
