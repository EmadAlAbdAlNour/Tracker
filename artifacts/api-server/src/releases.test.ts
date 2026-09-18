import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "./app";

describe("Releases & App-Version API", () => {
  it("GET /api/app-version returns valid version metadata without authentication", async () => {
    const res = await request(app).get("/api/app-version");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("version");
    expect(res.body).toHaveProperty("minSupportedVersion");
    expect(res.body).toHaveProperty("downloadUrl");
    expect(res.body).toHaveProperty("sha256");
    expect(res.body).toHaveProperty("releaseNotes");
    expect(res.body.packageName).toBe("com.tracker.driver");
  });

  it("GET /api/releases/latest is an alias returning the same release metadata", async () => {
    const res = await request(app).get("/api/releases/latest");
    expect(res.status).toBe(200);
    expect(res.body.version).toBe("1.0.0");
  });

  it("GET /api/releases/latest/download returns download stream or redirect", async () => {
    const res = await request(app).get("/api/releases/latest/download");
    // Depending on whether file exists or redirect, it's either 200, 302, or JSON fallback
    expect([200, 302]).toContain(res.status);
  });
});

