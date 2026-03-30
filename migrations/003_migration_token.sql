-- Migration 003: Add migration token fields to users table
-- Run: docker compose exec -T postgres psql -U fitai -d fitai_db < migrations/003_migration_token.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS migration_token VARCHAR(12),
  ADD COLUMN IF NOT EXISTS migration_token_expires_at TIMESTAMPTZ;
