-- Migration 0008: Ensure notification_reads table exists with cascade delete
-- Reconciles Drizzle schema with production database

CREATE TABLE IF NOT EXISTS "notification_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_reads_notification_id_notifications_id_fk'
  ) THEN
    ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_reads_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "notification_reads_user_notif_unique" ON "notification_reads" USING btree ("user_id", "notification_id");
CREATE INDEX IF NOT EXISTS "notification_reads_user_idx" ON "notification_reads" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "notification_reads_notification_idx" ON "notification_reads" USING btree ("notification_id");
