variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare Account ID"
}

variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API Token"
}

variable "google_client_id" {
  type        = string
  description = "Google OAuth Client ID for Cloudflare Access IdP"
}

variable "google_client_secret" {
  type        = string
  sensitive   = true
  description = "Google OAuth Client Secret for Cloudflare Access IdP"
}
