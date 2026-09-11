-- Telemetry on devices
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "battery_percentage" integer;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "is_charging" boolean DEFAULT false;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "location_services_enabled" boolean DEFAULT true;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "network_status" text DEFAULT 'unknown';

-- Composite index for fast latest driver location queries
CREATE INDEX IF NOT EXISTS "location_points_driver_recorded_idx" ON "location_points" ("driver_id", "recorded_at" DESC);

-- Restaurant settings table
CREATE TABLE IF NOT EXISTS "restaurant_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT 'Main Branch' NOT NULL,
	"latitude" double precision DEFAULT 24.7136 NOT NULL,
	"longitude" double precision DEFAULT 46.6753 NOT NULL,
	"radius_meters" double precision DEFAULT 150 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_settings_updated_by_users_id_fk'
  ) THEN
    ALTER TABLE "restaurant_settings" ADD CONSTRAINT "restaurant_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Alert settings table
CREATE TABLE IF NOT EXISTS "alert_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"max_stop_duration_minutes" integer DEFAULT 10 NOT NULL,
	"offline_grace_minutes" integer DEFAULT 5 NOT NULL,
	"low_battery_threshold" integer DEFAULT 20 NOT NULL,
	"critical_battery_threshold" integer DEFAULT 10 NOT NULL,
	"max_shift_duration_hours" integer DEFAULT 12 NOT NULL,
	"stop_alert_enabled" boolean DEFAULT true NOT NULL,
	"gps_alert_enabled" boolean DEFAULT true NOT NULL,
	"offline_alert_enabled" boolean DEFAULT true NOT NULL,
	"battery_alert_enabled" boolean DEFAULT true NOT NULL,
	"restaurant_geofence_alert_enabled" boolean DEFAULT true NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL,
	"in_app_alerts_enabled" boolean DEFAULT true NOT NULL,
	"push_alerts_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Notifications table
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'INFO' NOT NULL,
	"title_ar" text NOT NULL,
	"title_en" text NOT NULL,
	"message_ar" text NOT NULL,
	"message_en" text NOT NULL,
	"driver_id" uuid,
	"shift_id" uuid,
	"metadata" text,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_driver_id_drivers_id_fk'
  ) THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_shift_id_shifts_id_fk'
  ) THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "notifications_driver_idx" ON "notifications" USING btree ("driver_id");
CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "notifications" USING btree ("type");
CREATE INDEX IF NOT EXISTS "notifications_read_idx" ON "notifications" USING btree ("read");
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" USING btree ("created_at" DESC);

-- Alert state table (for active tracking, deduplication, cooldowns)
CREATE TABLE IF NOT EXISTS "alert_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"alert_type" text NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"last_notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state_data" text
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alert_state_driver_id_drivers_id_fk'
  ) THEN
    ALTER TABLE "alert_state" ADD CONSTRAINT "alert_state_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "alert_state_driver_alert_unique" ON "alert_state" USING btree ("driver_id", "alert_type");
CREATE INDEX IF NOT EXISTS "alert_state_last_notified_idx" ON "alert_state" USING btree ("last_notified_at");
