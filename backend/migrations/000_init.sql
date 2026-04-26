-- Codex Platform Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username    VARCHAR(50)  UNIQUE NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- CONTESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS contests (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       VARCHAR(255) NOT NULL,
    description TEXT,
    start_time  TIMESTAMPTZ  NOT NULL,
    end_time    TIMESTAMPTZ  NOT NULL,
    creator_id  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    allowlist   TEXT[]       DEFAULT '{}',
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    CONSTRAINT  chk_times CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_contests_creator ON contests(creator_id);
CREATE INDEX IF NOT EXISTS idx_contests_start   ON contests(start_time);

-- ============================================================
-- PROBLEMS
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'problem_difficulty') THEN
    CREATE TYPE problem_difficulty AS ENUM ('Easy', 'Medium', 'Hard');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS problems (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contest_id    UUID         NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    title         VARCHAR(255) NOT NULL,
    description   TEXT         NOT NULL,
    constraints   TEXT         NOT NULL DEFAULT '',
    sample_input  TEXT         DEFAULT '',
    sample_output TEXT         DEFAULT '',
    difficulty    problem_difficulty DEFAULT 'Easy',
    solution      TEXT,
    sort_order    INT          DEFAULT 0,
    created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_problems_contest ON problems(contest_id);

-- ============================================================
-- TEST CASES
-- ============================================================
CREATE TABLE IF NOT EXISTS testcases (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    problem_id      UUID    NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    input           TEXT    NOT NULL,
    expected_output TEXT    NOT NULL,
    is_sample       BOOLEAN DEFAULT FALSE,
    is_hidden       BOOLEAN DEFAULT TRUE,
    sort_order      INT     DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_testcases_problem ON testcases(problem_id);

-- ============================================================
-- SUBMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS submissions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id   UUID         NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    contest_id   UUID         NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    language     VARCHAR(20)  NOT NULL CHECK (language IN ('cpp', 'python', 'java')),
    code         TEXT         NOT NULL,
    submission_type TEXT      NOT NULL DEFAULT 'REAL' CHECK (submission_type IN ('REAL', 'PRACTICE', 'VIRTUAL')),
    verdict      VARCHAR(50)  DEFAULT 'Pending',
    runtime_ms   INT          DEFAULT 0,
    memory_kb    INT          DEFAULT 0,
    stdout       TEXT         DEFAULT '',
    stderr       TEXT         DEFAULT '',
    passed_count INT          DEFAULT 0,
    total_count  INT          DEFAULT 0,
    submitted_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_user     ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_problem  ON submissions(problem_id);
CREATE INDEX IF NOT EXISTS idx_submissions_contest  ON submissions(contest_id);
CREATE INDEX IF NOT EXISTS idx_submissions_verdict  ON submissions(verdict);
CREATE INDEX IF NOT EXISTS idx_submissions_combo    ON submissions(user_id, problem_id, contest_id);
