CREATE TYPE "ContactSubmissionStatus" AS ENUM ('NEW', 'READ', 'REPLIED', 'ARCHIVED');

CREATE TABLE "contact_submissions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "customer_id" TEXT,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "ContactSubmissionStatus" NOT NULL DEFAULT 'NEW',
  "reply_subject" TEXT,
  "reply_message" TEXT,
  "replied_at" TIMESTAMPTZ,
  "replied_by_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "contact_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_submissions_tenant_id_created_at_idx" ON "contact_submissions"("tenant_id", "created_at");
CREATE INDEX "contact_submissions_restaurant_id_created_at_idx" ON "contact_submissions"("restaurant_id", "created_at");
CREATE INDEX "contact_submissions_branch_id_created_at_idx" ON "contact_submissions"("branch_id", "created_at");
CREATE INDEX "contact_submissions_status_created_at_idx" ON "contact_submissions"("status", "created_at");

ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_replied_by_id_fkey" FOREIGN KEY ("replied_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
