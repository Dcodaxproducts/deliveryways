ALTER TABLE "staff_users"
  ADD COLUMN "login_username" VARCHAR(32);

CREATE UNIQUE INDEX "staff_users_login_username_ci_key"
  ON "staff_users" (LOWER("login_username"))
  WHERE "login_username" IS NOT NULL;

ALTER TABLE "orders"
  ADD COLUMN "source_key" VARCHAR(255),
  ADD COLUMN "source_request_hash" VARCHAR(64);

CREATE UNIQUE INDEX "orders_source_key_key" ON "orders"("source_key");

ALTER TABLE "group_order_sessions"
  ADD COLUMN "participant_limit" INTEGER NOT NULL DEFAULT 20;

ALTER TABLE "group_order_sessions"
  ADD CONSTRAINT "group_order_sessions_participant_limit_check"
  CHECK ("participant_limit" BETWEEN 2 AND 50);
