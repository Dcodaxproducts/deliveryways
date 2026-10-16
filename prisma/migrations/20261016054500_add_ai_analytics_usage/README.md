# Analytics Copilot audit migration notes

- **Forward:** creates one enum, one new table, three foreign keys, one unique index, and three bounded indexes.
- **Backfill:** none; the feature is new and disabled by default.
- **Lock risk:** only short PostgreSQL catalog locks for new objects and FK validation. Existing tables are not rewritten or altered.
- **Rollback:** use `ROLLBACK.sql`; it removes retained audit/usage history, so explicit approval is required outside scratch environments.
- **Release order:** deploy migration before enabling `AI_ANALYTICS_COPILOT_ENABLED`. A missing provider key is safe and produces deterministic fallback.
- **Rehearsal:** apply, rollback, and reapply on disposable PostgreSQL; never rehearse against shared/live databases.
