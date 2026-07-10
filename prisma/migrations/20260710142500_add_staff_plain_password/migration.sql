-- Store the client-visible staff password separately from the auth hash.
-- Existing staff rows cannot be backfilled because only bcrypt hashes were stored before this migration.
ALTER TABLE "staff_users" ADD COLUMN "plain_password" TEXT;
