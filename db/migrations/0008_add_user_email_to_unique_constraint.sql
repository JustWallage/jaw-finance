-- Contract: Recreate transactions table with user_email in the unique constraint.
-- Old constraint: UNIQUE(entry_reference, account_uid)
-- New constraint: UNIQUE(entry_reference, account_uid, user_email)

CREATE TABLE IF NOT EXISTS transactions_new (
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
  user_email TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entry_reference, account_uid, user_email)
);

INSERT INTO transactions_new (id, entry_reference, account_uid, amount, currency, credit_debit, status, booking_date, transaction_date, counterparty_name, remittance_info, user_email, created_at)
SELECT id, entry_reference, account_uid, amount, currency, credit_debit, status, booking_date, transaction_date, counterparty_name, remittance_info, user_email, created_at
FROM transactions;

DROP TABLE transactions;

ALTER TABLE transactions_new RENAME TO transactions;
