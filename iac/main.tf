terraform {
  required_version = ">= 1.5"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket                      = "jaw-finance-tfstate"
    key                         = "terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
    # endpoints.s3 is set via -backend-config at init time because
    # the backend block cannot interpolate variables.
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare Account ID"
}

variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API Token"
}

variable "allowed_emails" {
  type        = list(string)
  default     = ["just+cloudflare@wallage.nl"]
  description = "Email addresses allowed through Access OTP"
}

# --- Cloudflare Pages Project ---
resource "cloudflare_pages_project" "jaw_finance" {
  account_id        = var.cloudflare_account_id
  name              = "jaw-finance"
  production_branch = "main"
}

# --- Cloudflare Access: Zero Trust ---

# Access Application – protects finance.just.wallage.nl
resource "cloudflare_zero_trust_access_application" "jaw_finance" {
  account_id                = var.cloudflare_account_id
  name                      = "jaw-finance"
  domain                    = "finance.just.wallage.nl"
  type                      = "self_hosted"
  session_duration          = "24h"
  auto_redirect_to_identity = false
  app_launcher_visible      = true

  policies = [{
    name     = "Allow email OTP"
    decision = "allow"
    include = [{
      email = {
        email = var.allowed_emails[0]
      }
    }]
  }]
}

# Access Identity Provider – One-Time Pin
resource "cloudflare_zero_trust_access_identity_provider" "otp" {
  account_id = var.cloudflare_account_id
  name       = "One-Time Pin"
  type       = "onetimepin"
  config     = {}
}
