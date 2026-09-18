-- Migration 0007: True Permanent Hard Deletion
-- Drops obsolete deleted_at columns, configures cascade deletion for notifications, and purges any remaining tombstones

ALTER TABLE "users" DROP COLUMN IF EXISTS "deleted_at";
ALTER TABLE "drivers" DROP COLUMN IF EXISTS "deleted_at";

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_driver_id_drivers_id_fk";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_shift_id_shifts_id_fk";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE CASCADE;

-- Purge any Policy 1B anonymized tombstone accounts
DELETE FROM "users" WHERE "email" LIKE 'deleted_%@tracker.local' OR "name" = 'سائق محذوف';
