-- Add user_email to mock tables for user-scoped test resets.
ALTER TABLE mock_enable_banking_auth_codes ADD COLUMN user_email TEXT;
ALTER TABLE mock_enable_banking_sessions ADD COLUMN user_email TEXT;
