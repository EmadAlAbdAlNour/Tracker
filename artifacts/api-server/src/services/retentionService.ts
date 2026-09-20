import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

export interface RetentionResult {
  deletedCount: number;
  cutoff: string;
  durationMs: number;
}

/**
 * Automatically purges historical driver location points older than retentionHours (default: 48h).
 * Direct SQL DELETE uses the existing btree index: location_points_recorded_at_idx.
 * Only location_points are deleted. Users, drivers, devices, shifts, notifications, etc. are untouched.
 */
export async function pruneExpiredLocationPoints(retentionHours = 48): Promise<RetentionResult> {
  const startTime = Date.now();
  // Cutoff is calculated strictly server-side / database-side (ignoring client clocks)
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);

  try {
    const res = await pool.query(
      "DELETE FROM location_points WHERE recorded_at < $1",
      [cutoff]
    );

    const deletedCount = res.rowCount ?? 0;
    const durationMs = Date.now() - startTime;

    if (deletedCount > 0) {
      logger.info(
        { deletedCount, cutoff: cutoff.toISOString(), durationMs },
        "Pruned expired location telemetry older than 48 hours"
      );
    }

    return {
      deletedCount,
      cutoff: cutoff.toISOString(),
      durationMs,
    };
  } catch (err) {
    logger.error(
      { err, cutoff: cutoff.toISOString() },
      "Failed to prune expired location telemetry"
    );
    throw err;
  }
}

let lastRetentionRunTimestamp = 0;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Throttled execution: executes retention cleanup at most once per hour.
 * Non-blocking: catches and logs errors without bubbling to request handlers.
 */
export async function maybeRunRetentionCleanup(retentionHours = 48): Promise<void> {
  const now = Date.now();
  if (now - lastRetentionRunTimestamp < ONE_HOUR_MS) {
    return;
  }
  lastRetentionRunTimestamp = now;

  try {
    await pruneExpiredLocationPoints(retentionHours);
  } catch (err) {
    console.error("Automated 48h telemetry retention run failed:", err);
  }
}

export function resetRetentionThrottleForTesting(): void {
  lastRetentionRunTimestamp = 0;
}

