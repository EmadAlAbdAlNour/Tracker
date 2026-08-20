import { describe, expect, it } from "vitest";
import { getRetryDelayMs } from "./lib/location";
import { locationPointSchema } from "./validation/auth";

describe("location tracking validation", () => {
  it("accepts a valid driver location payload", () => {
    const result = locationPointSchema.parse({
      clientLocationId: "loc-001",
      latitude: 30.123456,
      longitude: 31.123456,
      accuracy: 8.5,
      altitude: 15.2,
      speed: 4.3,
      heading: 180,
      recordedAt: "2026-08-20T19:00:00.000Z",
      source: "mobile",
    });

    expect(result.latitude).toBe(30.123456);
    expect(result.longitude).toBe(31.123456);
    expect(result.clientLocationId).toBe("loc-001");
  });

  it("rejects invalid latitude", () => {
    expect(() =>
      locationPointSchema.parse({
        latitude: 200,
        longitude: 31.123456,
        recordedAt: "2026-08-20T19:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects invalid longitude", () => {
    expect(() =>
      locationPointSchema.parse({
        latitude: 30.123456,
        longitude: 200,
        recordedAt: "2026-08-20T19:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects invalid accuracy", () => {
    expect(() =>
      locationPointSchema.parse({
        latitude: 30.123456,
        longitude: 31.123456,
        accuracy: -1,
        recordedAt: "2026-08-20T19:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects invalid timestamps", () => {
    expect(() =>
      locationPointSchema.parse({
        latitude: 30.123456,
        longitude: 31.123456,
        recordedAt: "not-a-date",
      }),
    ).toThrow();
  });

  it("uses exponential retry backoff for queued uploads", () => {
    expect(getRetryDelayMs(0)).toBe(1000);
    expect(getRetryDelayMs(1)).toBe(2000);
    expect(getRetryDelayMs(5)).toBe(30000);
  });
});
