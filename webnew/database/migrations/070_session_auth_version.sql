-- Keep password/status/role changes and session issuance in the same revocation epoch.
-- Existing users and sessions start at epoch zero and remain compatible.
ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_sessions ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
