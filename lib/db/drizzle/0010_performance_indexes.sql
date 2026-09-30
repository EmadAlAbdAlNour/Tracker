-- Migration 0010: Add performance indexes on shifts(started_at) and notifications(resolved)
-- Optimizes operational report time window scans and active/resolved alert triage

CREATE INDEX IF NOT EXISTS "shifts_started_at_idx" ON "shifts" USING btree ("started_at");
CREATE INDEX IF NOT EXISTS "notifications_resolved_idx" ON "notifications" USING btree ("resolved");
