-- Add phone_pending flag to user_profiles
-- Used by handler to block AI Agent until user shares phone number after onboarding
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone_pending BOOLEAN DEFAULT false;
