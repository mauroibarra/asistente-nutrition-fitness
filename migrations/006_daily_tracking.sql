-- Migration: 006_daily_tracking.sql
-- Daily tracking tables required by System Prompt v2 (coach proactivo)
-- Provides dailyStatus, weeklyTrend, nextAction context variables for the AI Agent

-- ============================================================
-- Table: daily_targets
-- Daily nutritional targets and cumulative consumption per user per day.
-- Updated by the log_food_intake tool on every food report.
-- ============================================================
CREATE TABLE daily_targets (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_date         DATE NOT NULL,
  caloric_target      INTEGER NOT NULL,
  protein_target_g    INTEGER NOT NULL,
  carb_target_g       INTEGER NOT NULL,
  fat_target_g        INTEGER NOT NULL,
  calories_consumed   INTEGER DEFAULT 0,
  protein_consumed_g  INTEGER DEFAULT 0,
  carbs_consumed_g    INTEGER DEFAULT 0,
  fat_consumed_g      INTEGER DEFAULT 0,
  meals_logged        INTEGER DEFAULT 0,
  plan_adherence_pct  NUMERIC(5,2),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, target_date)
);

CREATE INDEX idx_daily_targets_user_date ON daily_targets(user_id, target_date);

-- ============================================================
-- Table: daily_intake_logs
-- Detailed record of every food item the user reports eating.
-- One row per meal report. Used by the AI Agent via log_food_intake tool.
-- ============================================================
CREATE TABLE daily_intake_logs (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type             VARCHAR(20) NOT NULL, -- breakfast, lunch, snack, dinner
  description           TEXT NOT NULL,
  estimated_calories    INTEGER,
  estimated_protein_g   INTEGER,
  estimated_carbs_g     INTEGER,
  estimated_fat_g       INTEGER,
  was_from_plan         BOOLEAN DEFAULT false,
  logged_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_daily_intake_user_date ON daily_intake_logs(user_id, log_date);

-- ============================================================
-- Alter: meal_plans — add plan_date for daily plans
-- The system prompt v2 shifts from weekly plans to daily plans.
-- plan_date = the specific date this plan is valid for.
-- NULL = legacy weekly plan (backward compatible).
-- ============================================================
ALTER TABLE meal_plans ADD COLUMN plan_date DATE;
CREATE INDEX idx_meal_plans_user_date ON meal_plans(user_id, plan_date);
