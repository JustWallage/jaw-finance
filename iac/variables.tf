variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare Account ID"
}

variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API Token"
}

# variable "allowed_emails" {
#   type        = list(string)
#   default     = ["just+cloudflare@wallage.nl"]
#   description = "Email addresses allowed through Access OTP"
# }
