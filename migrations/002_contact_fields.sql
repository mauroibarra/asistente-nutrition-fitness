-- Migration 002: Add contact fields to users table
-- Run once: docker compose exec -T postgres psql -U fitai -d fitai_db < migrations/002_contact_fields.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS document_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS country         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS city            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS phone_number    VARCHAR(50);
