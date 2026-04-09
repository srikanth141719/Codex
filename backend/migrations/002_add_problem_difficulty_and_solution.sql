-- 002_add_problem_difficulty_and_solution.sql
-- Add difficulty and solution fields to problems table.

BEGIN;

-- Difficulty enum for problems
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'problem_difficulty') THEN
    CREATE TYPE problem_difficulty AS ENUM ('Easy', 'Medium', 'Hard');
  END IF;
END$$;

-- Add columns if they do not already exist
ALTER TABLE problems
  ADD COLUMN IF NOT EXISTS difficulty problem_difficulty DEFAULT 'Easy',
  ADD COLUMN IF NOT EXISTS solution TEXT;

-- Track migration as applied
INSERT INTO schema_migrations (id)
VALUES ('002_add_problem_difficulty_and_solution')
ON CONFLICT (id) DO NOTHING;

COMMIT;

