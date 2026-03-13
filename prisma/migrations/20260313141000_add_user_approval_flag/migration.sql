ALTER TABLE "users"
ADD COLUMN "is_approved" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users"
SET "is_approved" = true;
