-- 001_add_constraints_and_submission_type.sql
-- Safe, idempotent-ish migration for existing databases.

BEGIN;

-- Track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Problems: add constraints column
ALTER TABLE problems
  ADD COLUMN IF NOT EXISTS constraints TEXT NOT NULL DEFAULT '';

-- Submissions: add submission_type (REAL|PRACTICE|VIRTUAL)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'submission_type') THEN
    CREATE TYPE submission_type AS ENUM ('REAL', 'PRACTICE', 'VIRTUAL');
  END IF;
END$$;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS submission_type submission_type NOT NULL DEFAULT 'REAL';

COMMIT;

