DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'StaffPanelType'
  ) THEN
    CREATE TYPE "StaffPanelType" AS ENUM (
      'SUPER_ADMIN',
      'BUSINESS_ADMIN',
      'BRANCH_ADMIN'
    );
  END IF;
END $$;

ALTER TABLE "staff_roles"
  ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "panel_type" "StaffPanelType",
  ADD COLUMN IF NOT EXISTS "permissions" JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'staff_roles'
      AND column_name = 'scope'
  ) THEN
    EXECUTE $sql$
      UPDATE "staff_roles"
      SET "panel_type" = CASE "scope"
        WHEN 'SUPER_ADMIN' THEN 'SUPER_ADMIN'::"StaffPanelType"
        WHEN 'RESTAURANT' THEN 'BUSINESS_ADMIN'::"StaffPanelType"
        WHEN 'BRANCH' THEN 'BRANCH_ADMIN'::"StaffPanelType"
        ELSE NULL
      END
      WHERE "panel_type" IS NULL
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'staff_role_permissions'
  ) THEN
    EXECUTE $sql$
      WITH aggregated_permissions AS (
        SELECT
          "staff_role_id",
          jsonb_agg(
            jsonb_build_object(
              'access', "access",
              'operations', to_jsonb("operations")
            )
            ORDER BY "access"
          ) AS permissions
        FROM "staff_role_permissions"
        GROUP BY "staff_role_id"
      )
      UPDATE "staff_roles" AS sr
      SET "permissions" = aggregated_permissions.permissions
      FROM aggregated_permissions
      WHERE sr."id" = aggregated_permissions."staff_role_id"
        AND sr."permissions" IS NULL
    $sql$;
  END IF;
END $$;

UPDATE "staff_roles"
SET "permissions" = '[]'::jsonb
WHERE "permissions" IS NULL;

UPDATE "staff_roles" AS sr
SET "tenant_id" = r."tenant_id"
FROM "restaurants" AS r
WHERE sr."tenant_id" IS NULL
  AND sr."restaurant_id" = r."id";

UPDATE "staff_roles" AS sr
SET "restaurant_id" = b."restaurant_id",
    "tenant_id" = COALESCE(sr."tenant_id", r."tenant_id")
FROM "branches" AS b
LEFT JOIN "restaurants" AS r
  ON r."id" = b."restaurant_id"
WHERE sr."branch_id" = b."id"
  AND (sr."restaurant_id" IS NULL OR sr."tenant_id" IS NULL);

UPDATE "staff_roles" AS sr
SET "owner_user_id" = (
  SELECT u."id"
  FROM "users" AS u
  WHERE u."role" = 'SUPER_ADMIN'
    AND u."deleted_at" IS NULL
  ORDER BY u."created_at" ASC
  LIMIT 1
)
WHERE sr."owner_user_id" IS NULL
  AND sr."panel_type" = 'SUPER_ADMIN';

UPDATE "staff_roles" AS sr
SET "owner_user_id" = (
  SELECT u."id"
  FROM "users" AS u
  WHERE u."role" = 'BUSINESS_ADMIN'
    AND u."deleted_at" IS NULL
    AND u."tenant_id" IS NOT DISTINCT FROM sr."tenant_id"
  ORDER BY u."created_at" ASC
  LIMIT 1
)
WHERE sr."owner_user_id" IS NULL
  AND sr."panel_type" = 'BUSINESS_ADMIN';

UPDATE "staff_roles" AS sr
SET "owner_user_id" = (
  SELECT u."id"
  FROM "users" AS u
  WHERE u."role" = 'BRANCH_ADMIN'
    AND u."deleted_at" IS NULL
    AND (
      u."branch_id" IS NOT DISTINCT FROM sr."branch_id"
      OR (
        sr."branch_id" IS NULL
        AND u."restaurant_id" IS NOT DISTINCT FROM sr."restaurant_id"
      )
    )
  ORDER BY u."created_at" ASC
  LIMIT 1
)
WHERE sr."owner_user_id" IS NULL
  AND sr."panel_type" = 'BRANCH_ADMIN';

UPDATE "staff_roles" AS sr
SET "owner_user_id" = (
  SELECT u."id"
  FROM "users" AS u
  WHERE u."role" = 'BUSINESS_ADMIN'
    AND u."deleted_at" IS NULL
    AND u."tenant_id" IS NOT DISTINCT FROM sr."tenant_id"
  ORDER BY u."created_at" ASC
  LIMIT 1
)
WHERE sr."owner_user_id" IS NULL
  AND sr."panel_type" = 'BRANCH_ADMIN';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "staff_roles"
    WHERE "owner_user_id" IS NULL
      OR "panel_type" IS NULL
      OR "permissions" IS NULL
  ) THEN
    RAISE EXCEPTION 'Unable to migrate staff_roles automatically. Resolve legacy staff role ownership/scope data before applying this migration.';
  END IF;
END $$;

ALTER TABLE "staff_roles"
  ALTER COLUMN "owner_user_id" SET NOT NULL,
  ALTER COLUMN "panel_type" SET NOT NULL,
  ALTER COLUMN "permissions" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "staff_roles_owner_user_id_panel_type_is_active_idx"
  ON "staff_roles"("owner_user_id", "panel_type", "is_active");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_roles_owner_user_id_fkey'
  ) THEN
    ALTER TABLE "staff_roles"
      ADD CONSTRAINT "staff_roles_owner_user_id_fkey"
      FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "staff_users" (
  "id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "staff_role_id" TEXT NOT NULL,
  "panel_type" "StaffPanelType" NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "first_name" TEXT NOT NULL,
  "last_name" TEXT NOT NULL,
  "phone" TEXT,
  "avatar_url" TEXT,
  "bio" TEXT,
  "refresh_token_hash" TEXT,
  "tenant_id" TEXT,
  "restaurant_id" TEXT,
  "branch_id" TEXT,
  "is_verified" BOOLEAN NOT NULL DEFAULT true,
  "is_approved" BOOLEAN NOT NULL DEFAULT true,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'staff_role_id'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM "users"
      WHERE "role" = 'STAFF'
        AND "deleted_at" IS NULL
        AND "staff_role_id" IS NULL
    ) THEN
      RAISE EXCEPTION 'Unable to migrate legacy staff users without staff_role_id. Repair legacy staff assignments before applying this migration.';
    END IF;

    INSERT INTO "staff_users" (
      "id",
      "owner_user_id",
      "staff_role_id",
      "panel_type",
      "email",
      "password",
      "first_name",
      "last_name",
      "phone",
      "avatar_url",
      "bio",
      "refresh_token_hash",
      "tenant_id",
      "restaurant_id",
      "branch_id",
      "is_verified",
      "is_approved",
      "is_active",
      "deleted_at",
      "created_at",
      "updated_at"
    )
    SELECT
      u."id",
      sr."owner_user_id",
      u."staff_role_id",
      sr."panel_type",
      u."email",
      u."password",
      COALESCE(p."first_name", 'Staff'),
      COALESCE(p."last_name", 'User'),
      p."phone",
      p."avatar_url",
      p."bio",
      u."refresh_token_hash",
      u."tenant_id",
      u."restaurant_id",
      u."branch_id",
      u."is_verified",
      u."is_approved",
      u."is_active",
      u."deleted_at",
      u."created_at",
      u."updated_at"
    FROM "users" AS u
    INNER JOIN "staff_roles" AS sr
      ON sr."id" = u."staff_role_id"
    LEFT JOIN "profiles" AS p
      ON p."user_id" = u."id"
    WHERE u."role" = 'STAFF'
      AND NOT EXISTS (
        SELECT 1
        FROM "staff_users" AS su
        WHERE su."id" = u."id"
      );

    UPDATE "users"
    SET "is_active" = false,
        "deleted_at" = COALESCE("deleted_at", NOW()),
        "refresh_token_hash" = NULL
    WHERE "role" = 'STAFF';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "staff_users_email_key"
  ON "staff_users"("email");

CREATE INDEX IF NOT EXISTS "staff_users_owner_user_id_panel_type_is_active_idx"
  ON "staff_users"("owner_user_id", "panel_type", "is_active");

CREATE INDEX IF NOT EXISTS "staff_users_tenant_id_restaurant_id_branch_id_is_active_idx"
  ON "staff_users"("tenant_id", "restaurant_id", "branch_id", "is_active");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_users_owner_user_id_fkey'
  ) THEN
    ALTER TABLE "staff_users"
      ADD CONSTRAINT "staff_users_owner_user_id_fkey"
      FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_users_staff_role_id_fkey'
  ) THEN
    ALTER TABLE "staff_users"
      ADD CONSTRAINT "staff_users_staff_role_id_fkey"
      FOREIGN KEY ("staff_role_id") REFERENCES "staff_roles"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_users_tenant_id_fkey'
  ) THEN
    ALTER TABLE "staff_users"
      ADD CONSTRAINT "staff_users_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_users_restaurant_id_fkey'
  ) THEN
    ALTER TABLE "staff_users"
      ADD CONSTRAINT "staff_users_restaurant_id_fkey"
      FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_users_branch_id_fkey'
  ) THEN
    ALTER TABLE "staff_users"
      ADD CONSTRAINT "staff_users_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_staff_role_id_fkey'
  ) THEN
    ALTER TABLE "users" DROP CONSTRAINT "users_staff_role_id_fkey";
  END IF;
END $$;

ALTER TABLE "users"
  DROP COLUMN IF EXISTS "staff_role_id";

DROP TABLE IF EXISTS "staff_role_permissions";

ALTER TABLE "staff_roles"
  DROP COLUMN IF EXISTS "scope";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'StaffRoleScope'
  ) THEN
    DROP TYPE "StaffRoleScope";
  END IF;
END $$;
