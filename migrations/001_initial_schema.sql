-- ============================================================
-- FitAI Assistant — Initial Schema Migration
-- Version: 001
-- ============================================================
-- Run with: psql $DATABASE_URL -f migrations/001_initial_schema.sql
-- ============================================================

BEGIN;

-- Track applied migrations
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(50) PRIMARY KEY,
    applied_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Guard: skip if already applied
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '001_initial_schema') THEN
        RAISE NOTICE 'Migration 001_initial_schema already applied, skipping.';
        -- Rollback the transaction to abort execution cleanly
        RAISE EXCEPTION 'already_applied';
    END IF;
END $$;

-- ============================================================
-- ENUMS
-- ============================================================

-- Membership status lifecycle: trial → active → expired/paused/cancelled
CREATE TYPE membership_status AS ENUM ('trial', 'active', 'expired', 'paused', 'cancelled');

-- Subscription plan tiers
CREATE TYPE plan_type AS ENUM ('basic', 'pro', 'premium');

-- User biological gender (for metabolic calculations)
CREATE TYPE gender_type AS ENUM ('male', 'female');

-- Fitness goal categories
CREATE TYPE goal_type AS ENUM ('lose_weight', 'gain_muscle', 'maintain', 'recomposition');

-- Activity level for TDEE calculation
CREATE TYPE activity_level AS ENUM ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active');

-- Fitness experience level
CREATE TYPE fitness_level AS ENUM ('beginner', 'intermediate', 'advanced');

-- User budget level for ingredient selection in meal plans
CREATE TYPE budget_level AS ENUM ('low', 'medium', 'high');

-- Payment method used
CREATE TYPE payment_method AS ENUM ('transfer', 'cash', 'card', 'other');

-- ============================================================
-- TABLE: users
-- Main user table. Each user identified by telegram_id.
-- ============================================================

CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    telegram_id     BIGINT UNIQUE NOT NULL,
    username        VARCHAR(255),
    first_name      VARCHAR(255) NOT NULL,
    last_name       VARCHAR(255),
    language_code   VARCHAR(10) DEFAULT 'es',
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup by Telegram ID (used on every incoming message)
CREATE UNIQUE INDEX idx_users_telegram_id ON users(telegram_id);

-- ============================================================
-- TABLE: admin_users
-- Admin panel users. Created before payment_logs (FK dependency).
-- ============================================================

CREATE TABLE admin_users (
    id              SERIAL PRIMARY KEY,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    is_active       BOOLEAN DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_admin_users_email ON admin_users(email);

-- ============================================================
-- TABLE: memberships
-- Subscription control and bot access.
-- ============================================================

CREATE TABLE memberships (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_type       plan_type NOT NULL DEFAULT 'basic',
    status          membership_status NOT NULL DEFAULT 'trial',
    starts_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    paused_at       TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Membership verification query (executed on every message)
CREATE INDEX idx_memberships_active ON memberships(user_id, status, expires_at)
    WHERE status = 'active';

-- Expiration alerts (cron job queries memberships expiring within 3 days)
CREATE INDEX idx_memberships_expiring ON memberships(expires_at)
    WHERE status = 'active';

-- ============================================================
-- TABLE: payment_logs
-- Manual payment registry (Phase 1: no payment gateway).
-- ============================================================

CREATE TABLE payment_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    membership_id   INTEGER REFERENCES memberships(id),
    amount          DECIMAL(10, 2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'MXN',
    payment_method  payment_method NOT NULL DEFAULT 'transfer',
    reference_note  TEXT,
    registered_by   INTEGER REFERENCES admin_users(id),
    payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_logs_user ON payment_logs(user_id);
CREATE INDEX idx_payment_logs_date ON payment_logs(payment_date);

-- ============================================================
-- TABLE: user_profiles
-- Health and fitness profile collected during onboarding.
-- ============================================================

CREATE TABLE user_profiles (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gender                  gender_type NOT NULL,
    age                     INTEGER NOT NULL CHECK (age >= 14 AND age <= 100),
    height_cm               DECIMAL(5, 1) NOT NULL CHECK (height_cm >= 100 AND height_cm <= 250),
    weight_kg               DECIMAL(5, 1) NOT NULL CHECK (weight_kg >= 30 AND weight_kg <= 300),
    body_fat_percentage     DECIMAL(4, 1) CHECK (body_fat_percentage >= 3 AND body_fat_percentage <= 60),
    activity_level          activity_level NOT NULL DEFAULT 'moderately_active',
    fitness_level           fitness_level NOT NULL DEFAULT 'beginner',
    goal                    goal_type NOT NULL,
    dietary_restrictions    TEXT[] DEFAULT '{}',
    food_allergies          TEXT[] DEFAULT '{}',
    disliked_foods          TEXT[] DEFAULT '{}',
    injuries                TEXT[] DEFAULT '{}',
    available_equipment     TEXT[] DEFAULT '{}',
    training_days_per_week  INTEGER DEFAULT 3 CHECK (training_days_per_week >= 1 AND training_days_per_week <= 7),
    wake_up_time            TIME DEFAULT '07:00',
    sleep_time              TIME DEFAULT '23:00',
    meal_count              INTEGER DEFAULT 3 CHECK (meal_count >= 2 AND meal_count <= 6),
    local_culture           VARCHAR(50) DEFAULT 'mexican',
    budget_level            budget_level NOT NULL DEFAULT 'medium',
    onboarding_completed    BOOLEAN DEFAULT false,
    onboarding_completed_at TIMESTAMPTZ,
    bmr                     DECIMAL(7, 2),
    tdee                    DECIMAL(7, 2),
    caloric_target          DECIMAL(7, 2),
    protein_target_g        DECIMAL(6, 1),
    carb_target_g           DECIMAL(6, 1),
    fat_target_g            DECIMAL(6, 1),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_profiles_user ON user_profiles(user_id);

-- ============================================================
-- TABLE: goals
-- User-defined goals with target values and progress tracking.
-- ============================================================

CREATE TABLE goals (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_type       goal_type NOT NULL,
    target_weight   DECIMAL(5, 1),
    target_body_fat DECIMAL(4, 1),
    start_weight    DECIMAL(5, 1) NOT NULL,
    start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    target_date     DATE,
    is_active       BOOLEAN DEFAULT true,
    achieved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_goals_user_active ON goals(user_id) WHERE is_active = true;

-- ============================================================
-- TABLE: meal_plans
-- Weekly meal plans generated by the AI agent (stored as JSONB).
-- ============================================================

CREATE TABLE meal_plans (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_number     INTEGER NOT NULL,
    year            INTEGER NOT NULL,
    plan_json       JSONB NOT NULL,
    total_calories  DECIMAL(7, 1),
    is_active       BOOLEAN DEFAULT true,
    generated_at    TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meal_plans_user_active ON meal_plans(user_id) WHERE is_active = true;
CREATE INDEX idx_meal_plans_week ON meal_plans(user_id, year, week_number);

-- ============================================================
-- TABLE: exercise_plans
-- Weekly workout plans generated by the AI agent (stored as JSONB).
-- ============================================================

CREATE TABLE exercise_plans (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_number     INTEGER NOT NULL,
    year            INTEGER NOT NULL,
    plan_json       JSONB NOT NULL,
    fitness_level   fitness_level NOT NULL,
    is_active       BOOLEAN DEFAULT true,
    generated_at    TIMESTAMPTZ DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exercise_plans_user_active ON exercise_plans(user_id) WHERE is_active = true;
CREATE INDEX idx_exercise_plans_week ON exercise_plans(user_id, year, week_number);

-- ============================================================
-- TABLE: weight_logs
-- Periodic user weight records for progress tracking.
-- ============================================================

CREATE TABLE weight_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weight_kg       DECIMAL(5, 1) NOT NULL CHECK (weight_kg >= 30 AND weight_kg <= 300),
    body_fat_pct    DECIMAL(4, 1),
    notes           TEXT,
    logged_at       DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_weight_logs_user_date ON weight_logs(user_id, logged_at DESC);

-- ============================================================
-- TABLE: conversation_logs
-- Conversation history for analytics and debugging.
-- ============================================================

CREATE TABLE conversation_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_text    TEXT NOT NULL,
    response_text   TEXT,
    message_type    VARCHAR(20) DEFAULT 'text',
    tokens_used     INTEGER,
    tools_called    TEXT[],
    processing_ms   INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversation_logs_user ON conversation_logs(user_id, created_at DESC);

-- ============================================================
-- TRIGGERS: auto-update updated_at on row modification
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memberships_updated_at
    BEFORE UPDATE ON memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_goals_updated_at
    BEFORE UPDATE ON goals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at
    BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MARK MIGRATION AS APPLIED
-- ============================================================

INSERT INTO schema_migrations (version) VALUES ('001_initial_schema');

COMMIT;
