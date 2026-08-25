-- Add CALL_CENTER to user_role enum
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'CALL_CENTER';

-- Add authorized flag to devices
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "authorized" boolean NOT NULL DEFAULT false;

-- Add device_id to refresh_tokens for associating refresh tokens with devices
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "device_id" uuid NULL;

-- Create index on refresh_tokens.device_id
CREATE INDEX IF NOT EXISTS "refresh_tokens_device_idx" ON "refresh_tokens" USING btree ("device_id");

-- Add foreign key constraint linking refresh_tokens.device_id to devices.id
ALTER TABLE "refresh_tokens" ADD CONSTRAINT IF NOT EXISTS "refresh_tokens_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE SET NULL;

-- Enforce at most one authorized device per driver using a partial unique index
-- This ensures at DB level that a given driver cannot have more than one device with authorized = true
CREATE UNIQUE INDEX IF NOT EXISTS "devices_driver_one_authorized_idx" ON "devices" ("driver_id") WHERE ("authorized" = true);
