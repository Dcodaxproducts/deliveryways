-- Manual rollback. Run only after confirming no retained audit rows are required.
DROP TABLE IF EXISTS "ai_analytics_usage";
DROP TYPE IF EXISTS "AiAnalyticsUsageStatus";
