UPDATE "users"
SET "restaurant_id" = NULL,
    "branch_id" = NULL
WHERE "role" = 'BUSINESS_ADMIN';
