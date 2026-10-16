-- Additive, tenant-scoped audit and usage persistence for Analytics Copilot.
-- No backfill is required because the feature is new and disabled by default.
CREATE TYPE "AiAnalyticsUsageStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FALLBACK', 'FAILED');

CREATE TABLE "ai_analytics_usage" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "actor_id" TEXT NOT NULL,
  "actor_role" VARCHAR(40) NOT NULL,
  "request_id" UUID NOT NULL,
  "intent" VARCHAR(40) NOT NULL,
  "period_from" TIMESTAMPTZ NOT NULL,
  "period_to_exclusive" TIMESTAMPTZ NOT NULL,
  "comparison_from" TIMESTAMPTZ,
  "comparison_to" TIMESTAMPTZ,
  "timezone" VARCHAR(64) NOT NULL,
  "locale" VARCHAR(16) NOT NULL,
  "question_hash" VARCHAR(64) NOT NULL,
  "snapshot_hash" VARCHAR(64),
  "prompt_version" VARCHAR(80) NOT NULL,
  "provider" VARCHAR(40),
  "model" VARCHAR(120),
  "status" "AiAnalyticsUsageStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "fallback_reason" VARCHAR(80),
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost_micro" INTEGER NOT NULL DEFAULT 0,
  "latency_ms" INTEGER NOT NULL DEFAULT 0,
  "response" JSONB,
  "error_code" VARCHAR(80),
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ai_analytics_usage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_analytics_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_analytics_usage_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_analytics_usage_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ai_analytics_usage_scope_request_key" ON "ai_analytics_usage"("tenant_id", "restaurant_id", "request_id");
CREATE INDEX "ai_analytics_usage_scope_created_idx" ON "ai_analytics_usage"("tenant_id", "restaurant_id", "created_at");
CREATE INDEX "ai_analytics_usage_actor_created_idx" ON "ai_analytics_usage"("tenant_id", "restaurant_id", "actor_id", "created_at");
CREATE INDEX "ai_analytics_usage_retention_idx" ON "ai_analytics_usage"("expires_at");
