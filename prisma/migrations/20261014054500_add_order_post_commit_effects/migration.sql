-- Durable, token-fenced post-commit work for POS-created orders.
CREATE TABLE "order_post_commit_effects" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "effect_type" VARCHAR(64) NOT NULL,
    "claim_token" VARCHAR(64),
    "lease_expires_at" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ,
    "last_error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "order_post_commit_effects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_post_commit_effects_order_type_key"
    ON "order_post_commit_effects"("order_id", "effect_type");

CREATE INDEX "order_post_commit_effects_pending_idx"
    ON "order_post_commit_effects"("completed_at", "lease_expires_at", "created_at");

ALTER TABLE "order_post_commit_effects"
    ADD CONSTRAINT "order_post_commit_effects_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
