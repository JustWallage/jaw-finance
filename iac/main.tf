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

# --- Cloudflare Pages Project ---
resource "cloudflare_pages_project" "jaw_finance" {
  account_id        = var.cloudflare_account_id
  name              = "jaw-finance"
  production_branch = "main"

  # wrangler pages deploy may update wrangler_config_hash and other
  # deployment-level fields; let Terraform ignore that drift.
  lifecycle {
    ignore_changes = [deployment_configs]
  }
}

# --- Cloudflare Pages Custom Domain ---
# This tells Cloudflare to accept traffic from your AWS Route53 domain
resource "cloudflare_pages_domain" "jaw_finance_domain" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.jaw_finance.name
  name         = "finance.just.wallage.nl"
}

# --- Cloudflare D1 Databases ---
resource "cloudflare_d1_database" "jaw_finance_prod" {
  account_id = var.cloudflare_account_id
  name       = "jaw-finance-prod"
  read_replication = {
    mode = "disabled"
  }
}

# --- Cloudflare Access: Zero Trust ---

# Google Identity Provider
resource "cloudflare_zero_trust_access_identity_provider" "google" {
  account_id = var.cloudflare_account_id
  name       = "Google"
  type       = "google"

  config = {
    client_id     = var.google_client_id
    client_secret = var.google_client_secret
  }
}

# Access Application – protects finance.just.wallage.nl/api
resource "cloudflare_zero_trust_access_application" "jaw_finance" {
  account_id                = var.cloudflare_account_id
  name                      = "jaw-finance"
  domain                    = "finance.just.wallage.nl/api"
  type                      = "self_hosted"
  session_duration          = "24h"
  auto_redirect_to_identity = false
  app_launcher_visible      = true

  # We strictly depend on the domain being registered in Pages first
  depends_on = [cloudflare_pages_domain.jaw_finance_domain]

  policies = [{
    name     = "Allow Google login"
    decision = "allow"
    include = [{
      everyone = {}
    }]
  }]
}
