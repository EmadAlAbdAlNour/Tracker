-- Migration 0006: Permanent User / Driver Deletion Anonymization (Policy 1B)
-- Adds nullable deleted_at timestamp with time zone to users and drivers tables

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
