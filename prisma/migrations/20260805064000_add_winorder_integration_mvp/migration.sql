-- Forward-only additive migration for the WinOrder REST MVP.
-- Rollback (before production data exists): drop the five winorder_* tables,
-- drop the three WinOrder enums, then drop the two estimated_* order columns.

CREATE TYPE "WinOrderCatalogMappingType" AS ENUM ('ITEM', 'MODIFIER', 'SERVICE_CHARGE');
CREATE TYPE "WinOrderExportState" AS ENUM ('PENDING', 'LEASED', 'ACKNOWLEDGED', 'FAILED');
CREATE TYPE "WinOrderStatusEventResult" AS ENUM ('PROCESSED', 'DUPLICATE', 'FAILED', 'IGNORED');

ALTER TABLE "orders"
  ADD COLUMN "estimated_completion_at" TIMESTAMPTZ,
  ADD COLUMN "estimated_preparation_minutes" INTEGER;

CREATE TABLE "winorder_connections" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "username" VARCHAR(191) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "credential_version" INTEGER NOT NULL DEFAULT 1,
  "store_id" INTEGER,
  "store_name" VARCHAR(191),
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "last_poll_at" TIMESTAMPTZ,
  "last_successful_callback_at" TIMESTAMPTZ,
  "last_error_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "winorder_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "winorder_catalog_mappings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "mapping_type" "WinOrderCatalogMappingType" NOT NULL,
  "local_key" VARCHAR(512) NOT NULL,
  "local_name" VARCHAR(255),
  "external_article_no" VARCHAR(191) NOT NULL,
  "external_article_name" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "winorder_catalog_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "winorder_payment_mappings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "payment_method" "PaymentMethod" NOT NULL,
  "external_label" VARCHAR(191) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "winorder_payment_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "winorder_order_exports" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "state" "WinOrderExportState" NOT NULL DEFAULT 'PENDING',
  "lease_token" VARCHAR(191),
  "lease_expires_at" TIMESTAMPTZ,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "acknowledged_at" TIMESTAMPTZ,
  "failed_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "winorder_order_exports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "winorder_status_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "export_id" TEXT,
  "order_id" TEXT NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "tracking_status" VARCHAR(20) NOT NULL,
  "message" TEXT,
  "deliver_minutes" INTEGER,
  "deliver_eta" TIMESTAMPTZ,
  "reject_reason" TEXT,
  "raw_payload" JSONB NOT NULL,
  "result" "WinOrderStatusEventResult" NOT NULL,
  "error_message" TEXT,
  "processed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "winorder_status_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "winorder_connections_branch_id_key" ON "winorder_connections"("branch_id");
CREATE UNIQUE INDEX "winorder_connections_username_key" ON "winorder_connections"("username");
CREATE INDEX "winorder_connections_tenant_id_restaurant_id_branch_id_idx" ON "winorder_connections"("tenant_id", "restaurant_id", "branch_id");
CREATE INDEX "winorder_connections_tenant_id_is_enabled_updated_at_idx" ON "winorder_connections"("tenant_id", "is_enabled", "updated_at");

CREATE UNIQUE INDEX "winorder_catalog_mappings_connection_id_mapping_type_local_key_key" ON "winorder_catalog_mappings"("connection_id", "mapping_type", "local_key");
CREATE INDEX "winorder_catalog_mappings_tenant_id_restaurant_id_branch_id_idx" ON "winorder_catalog_mappings"("tenant_id", "restaurant_id", "branch_id");
CREATE INDEX "winorder_catalog_mappings_tenant_id_connection_id_mapping_type_idx" ON "winorder_catalog_mappings"("tenant_id", "connection_id", "mapping_type");

CREATE UNIQUE INDEX "winorder_payment_mappings_connection_id_payment_method_key" ON "winorder_payment_mappings"("connection_id", "payment_method");
CREATE INDEX "winorder_payment_mappings_tenant_id_restaurant_id_branch_id_idx" ON "winorder_payment_mappings"("tenant_id", "restaurant_id", "branch_id");
CREATE INDEX "winorder_payment_mappings_tenant_id_connection_id_idx" ON "winorder_payment_mappings"("tenant_id", "connection_id");

CREATE UNIQUE INDEX "winorder_order_exports_connection_id_order_id_key" ON "winorder_order_exports"("connection_id", "order_id");
CREATE INDEX "winorder_order_exports_tenant_id_restaurant_id_branch_id_idx" ON "winorder_order_exports"("tenant_id", "restaurant_id", "branch_id");
CREATE INDEX "winorder_order_exports_tenant_id_connection_id_state_lease_expires_at_idx" ON "winorder_order_exports"("tenant_id", "connection_id", "state", "lease_expires_at");
CREATE INDEX "winorder_order_exports_tenant_id_order_id_idx" ON "winorder_order_exports"("tenant_id", "order_id");

CREATE UNIQUE INDEX "winorder_status_events_connection_id_fingerprint_key" ON "winorder_status_events"("connection_id", "fingerprint");
CREATE INDEX "winorder_status_events_tenant_id_restaurant_id_branch_id_idx" ON "winorder_status_events"("tenant_id", "restaurant_id", "branch_id");
CREATE INDEX "winorder_status_events_tenant_id_connection_id_processed_at_idx" ON "winorder_status_events"("tenant_id", "connection_id", "processed_at");
CREATE INDEX "winorder_status_events_tenant_id_order_id_processed_at_idx" ON "winorder_status_events"("tenant_id", "order_id", "processed_at");

ALTER TABLE "winorder_catalog_mappings" ADD CONSTRAINT "winorder_catalog_mappings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "winorder_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "winorder_payment_mappings" ADD CONSTRAINT "winorder_payment_mappings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "winorder_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "winorder_order_exports" ADD CONSTRAINT "winorder_order_exports_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "winorder_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "winorder_status_events" ADD CONSTRAINT "winorder_status_events_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "winorder_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "winorder_status_events" ADD CONSTRAINT "winorder_status_events_export_id_fkey" FOREIGN KEY ("export_id") REFERENCES "winorder_order_exports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
