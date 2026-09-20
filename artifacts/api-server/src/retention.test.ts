import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();

vi.mock("@workspace/db", () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

vi.mock("./lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  pruneExpiredLocationPoints,
  maybeRunRetentionCleanup,
  resetRetentionThrottleForTesting,
} from "./services/retentionService";

describe("48-Hour Telemetry Retention Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRetentionThrottleForTesting();
  });

  it("executes indexed DELETE on location_points with server-side 48h cutoff", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 142 });

    const beforeCall = Date.now();
    const result = await pruneExpiredLocationPoints(48);
    const afterCall = Date.now();

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sqlQuery, params] = mockQuery.mock.calls[0];

    // Verify exact table and WHERE clause
    expect(sqlQuery).toBe("DELETE FROM location_points WHERE recorded_at < $1");
    expect(params).toHaveLength(1);

    const cutoffDate = params[0] as Date;
    expect(cutoffDate).toBeInstanceOf(Date);

    // Verify cutoff is approximately 48 hours in the past
    const expectedCutoffMin = beforeCall - 48 * 60 * 60 * 1000;
    const expectedCutoffMax = afterCall - 48 * 60 * 60 * 1000;
    expect(cutoffDate.getTime()).toBeGreaterThanOrEqual(expectedCutoffMin);
    expect(cutoffDate.getTime()).toBeLessThanOrEqual(expectedCutoffMax);

    expect(result.deletedCount).toBe(142);
  });

  it("does not target or touch any other tables (users, drivers, devices, shifts, notifications)", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });

    await pruneExpiredLocationPoints(48);

    const [sqlQuery] = mockQuery.mock.calls[0];
    // Ensure no other table names are referenced in the SQL statement
    expect(sqlQuery).not.toContain("users");
    expect(sqlQuery).not.toContain("drivers");
    expect(sqlQuery).not.toContain("devices");
    expect(sqlQuery).not.toContain("shifts");
    expect(sqlQuery).not.toContain("notifications");
  });

  it("is idempotent and can safely run repeatedly", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 50 });
    const run1 = await pruneExpiredLocationPoints(48);
    expect(run1.deletedCount).toBe(50);

    // Immediate second run deletes 0 rows safely
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    const run2 = await pruneExpiredLocationPoints(48);
    expect(run2.deletedCount).toBe(0);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("does not delete telemetry newer than cutoff (verifies strictly less-than condition)", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 10 });
    await pruneExpiredLocationPoints(48);

    const [sqlQuery] = mockQuery.mock.calls[0];
    // strictly less than (<), ensuring records newer than cutoff are retained
    expect(sqlQuery).toContain("WHERE recorded_at < $1");
  });

  it("throttles recurring execution to at most once per hour", async () => {
    mockQuery.mockResolvedValue({ rowCount: 10 });

    // First call executes
    await maybeRunRetentionCleanup(48);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    // Immediate subsequent calls within the same hour are throttled
    await maybeRunRetentionCleanup(48);
    await maybeRunRetentionCleanup(48);
    expect(mockQuery).toHaveBeenCalledTimes(1);

    // Resetting throttle allows next execution
    resetRetentionThrottleForTesting();
    await maybeRunRetentionCleanup(48);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("handles database errors gracefully without throwing in throttled runner", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Database connection timeout"));

    // Should not throw or crash
    await expect(maybeRunRetentionCleanup(48)).resolves.toBeUndefined();
  });
});

