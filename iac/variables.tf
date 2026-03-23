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

variable "bunq_api_key_sandbox" {
  type        = string
  sensitive   = true
  description = "bunq sandbox API key"
}

variable "bunq_private_key_sandbox" {
  type        = string
  sensitive   = true
  description = "bunq sandbox RSA private key (PEM)"
}

variable "bunq_installation_token_sandbox" {
  type        = string
  sensitive   = true
  description = "bunq sandbox installation token"
}

variable "bunq_server_public_key_sandbox" {
  type        = string
  sensitive   = true
  description = "bunq sandbox server public key (PEM)"
}
