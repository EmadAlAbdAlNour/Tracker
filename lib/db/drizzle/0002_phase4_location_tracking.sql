ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "last_location_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "location_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"shift_id" uuid,
	"client_location_id" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy" double precision,
	"altitude" double precision,
	"speed" double precision,
	"heading" double precision,
	"recorded_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'mobile' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "location_points" ADD CONSTRAINT "location_points_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "location_points" ADD CONSTRAINT "location_points_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "location_points_driver_idx" ON "location_points" USING btree ("driver_id");
CREATE INDEX IF NOT EXISTS "location_points_shift_idx" ON "location_points" USING btree ("shift_id");
CREATE INDEX IF NOT EXISTS "location_points_recorded_at_idx" ON "location_points" USING btree ("recorded_at");
CREATE UNIQUE INDEX IF NOT EXISTS "location_points_driver_client_location_unique" ON "location_points" USING btree ("driver_id", "client_location_id") WHERE "client_location_id" IS NOT NULL;
