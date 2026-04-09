output "d1_database_id_staging" {
  value = cloudflare_d1_database.jaw_finance_staging.id
}

output "d1_database_id_prod" {
  value = cloudflare_d1_database.jaw_finance_prod.id
}

output "e2e_service_token_client_id" {
  value = cloudflare_zero_trust_access_service_token.e2e.client_id
}

output "e2e_service_token_client_secret" {
  value     = cloudflare_zero_trust_access_service_token.e2e.client_secret
  sensitive = true
}
