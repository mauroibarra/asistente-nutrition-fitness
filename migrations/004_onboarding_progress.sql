-- ============================================================
-- Migration 004: Onboarding progress checkpoint
-- Stores partial onboarding answers so users can resume
-- ============================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '004_onboarding_progress') THEN
        RAISE EXCEPTION 'already_applied';
    END IF;
END $$;

CREATE TABLE onboarding_progress (
    user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    answers      JSONB NOT NULL DEFAULT '{}',
    last_step    INTEGER NOT NULL DEFAULT 0,  -- 0-20, tracks last completed question
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('004_onboarding_progress');

COMMIT;
