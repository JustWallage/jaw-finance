CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_reference TEXT,
  account_uid TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL,
  credit_debit TEXT NOT NULL,
  status TEXT NOT NULL,
  booking_date TEXT,
  transaction_date TEXT,
  counterparty_name TEXT,
  remittance_info TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entry_reference, account_uid)
);
