// Shared database row types used by both frontend and backend.

/** Full bank_connections row as stored in D1. */
export interface DBBankConnection {
  id: number;
  session_id: string;
  account_uid: string;
  aspsp_name: string;
  aspsp_country: string;
  iban: string | null;
  valid_until: string;
  oldest_synced_date: string | null;
  user_email: string | null;
  created_at: string;
  updated_at: string;
}

/** Full transactions row as stored in D1. */
export interface DBTransaction {
  id: number;
  entry_reference: string | null;
  account_uid: string;
  amount: string;
  currency: string;
  credit_debit: string;
  status: string;
  booking_date: string | null;
  transaction_date: string | null;
  counterparty_name: string | null;
  remittance_info: string | null;
  user_email: string | null;
  created_at: string;
}

/** Enable Banking API transaction shape. */
export interface EBTransaction {
  entry_reference?: string;
  transaction_amount: { currency: string; amount: string };
  credit_debit_indicator: string;
  status: string;
  booking_date?: string;
  transaction_date?: string;
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string[];
}

/** Enable Banking API transactions response. */
export interface EBTransactionsResponse {
  transactions: EBTransaction[];
  continuation_key?: string;
}

/** Enable Banking POST /sessions response account resource. */
export interface EBAccountResource {
  uid?: string;
  account_id?: { iban?: string };
}

/** Enable Banking POST /sessions response. */
export interface EBSessionResponse {
  session_id: string;
  accounts: EBAccountResource[];
  aspsp: { name: string; country: string };
  access: { valid_until: string };
}

/** Mock auth code row from mock_enable_banking_auth_codes table. */
export interface MockAuthCodeRow {
  code: string;
  aspsp_name: string;
  aspsp_country: string;
  redirect_url: string;
  valid_until: string;
  used: number;
}
