-- Restaurant-level transaction fees are not supported. Service charge remains
-- restaurant-level under settings.serviceCharge; transaction fee stays global/platform-level.
UPDATE "restaurants"
SET "settings" = (COALESCE("settings"::jsonb, '{}'::jsonb) - 'transactionFee')::jsonb
WHERE "settings"::jsonb ? 'transactionFee';
