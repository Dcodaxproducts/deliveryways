-- Additive migration: existing profile.metadata reservations remain readable during the backfill window.
CREATE TABLE "table_reservations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "reservation_date" TIMESTAMPTZ NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "guest_count" INTEGER NOT NULL,
    "note" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    "guest_name" VARCHAR(100) NOT NULL,
    "guest_email" VARCHAR(254) NOT NULL,
    "guest_phone" VARCHAR(20) NOT NULL,
    "idempotency_scope" VARCHAR(200) NOT NULL,
    "client_request_id" UUID NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "table_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "table_reservations_duration_minutes_check" CHECK ("duration_minutes" > 0 AND "duration_minutes" <= 480),
    CONSTRAINT "table_reservations_guest_count_check" CHECK ("guest_count" > 0 AND "guest_count" <= 50),
    CONSTRAINT "table_reservations_status_check" CHECK ("status" IN ('REQUESTED', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED'))
);

CREATE UNIQUE INDEX "table_reservations_idempotency_scope_client_request_id_key"
    ON "table_reservations"("idempotency_scope", "client_request_id");
CREATE INDEX "table_reservations_restaurant_id_created_at_idx"
    ON "table_reservations"("restaurant_id", "created_at");
CREATE INDEX "table_reservations_branch_id_reservation_date_status_idx"
    ON "table_reservations"("branch_id", "reservation_date", "status");
CREATE INDEX "table_reservations_customer_id_created_at_idx"
    ON "table_reservations"("customer_id", "created_at");

ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
