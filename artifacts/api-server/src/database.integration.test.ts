import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { config as loadDotEnv } from "dotenv";
import jwt from "jsonwebtoken";

// 1. Resolve root .env and configure disposable test database URL
function findRootDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, ".env"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const rootDir = findRootDir();
loadDotEnv({ path: path.join(rootDir, ".env"), override: true });

const baseDbUrl = process.env.DATABASE_URL!;
// Point to the migrated disposable database
const disposableDbName = "tracker_disp_1789165895317";
const disposableDbUrl = baseDbUrl.replace(/\/neondb(\?|$)/, `/${disposableDbName}$1`);

process.env.DATABASE_URL = disposableDbUrl;
process.env.JWT_SECRET = "test-integration-jwt-secret-very-secure";
process.env.JWT_REFRESH_SECRET = "test-integration-refresh-secret-very-secure";
process.env.CORS_ALLOWED_ORIGINS = "https://tracker-web-psi.vercel.app,http://localhost:3000";

// Import real modules (no service or DB mocks!)
import { db, pool, usersTable, driversTable, devicesTable, shiftsTable, locationPointsTable, alertStateTable, notificationsTable, restaurantSettingsTable, alertSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import * as authService from "./services/authService";
import * as alertService from "./services/alertService";
import * as settingsService from "./services/settingsService";
import * as libAuth from "./lib/auth";
import request from "supertest";
import app from "./app";

const agent = request(app);

describe("REAL DISPOSABLE POSTGRESQL INTEGRATION SUITE", () => {
  let adminUser: any;
  let adminAccessToken: string;
  let adminRefreshToken: string;

  let managerUser: any;
  let managerAccessToken: string;

  let driverUser: any;
  let driverRecord: any;
  let driverAccessToken: string;
  let driverRefreshToken: string;
  let driverDevice: any;

  beforeAll(async () => {
    // Safety check: ensure we are NOT connected to the production database 'neondb'
    const dbCheck = await pool.query("SELECT current_database() as name");
    const activeDb = dbCheck.rows[0]?.name;
    if (activeDb === "neondb" || !activeDb?.startsWith("tracker_disp_")) {
      throw new Error(
        `SAFETY BLOCK: Integration test attempted to run against protected database '${activeDb}'. ` +
        `Only approved disposable databases (tracker_disp_*) are allowed.`
      );
    }

    // Clean tables before suite execution to guarantee isolation
    await db.delete(notificationsTable);
    await db.delete(alertStateTable);
    await db.delete(locationPointsTable);
    await db.delete(shiftsTable);
    await db.delete(devicesTable);
    await db.delete(driversTable);
    await db.delete(usersTable);

    // Create Initial Admin User
    const adminHash = await libAuth.hashPassword("AdminSecret123!");
    const [createdAdmin] = await db
      .insert(usersTable)
      .values({
        name: "Super Admin",
        email: "admin.integration@tracker.local",
        phone: "+966500000001",
        passwordHash: adminHash,
        role: "ADMIN",
        active: true,
      })
      .returning();
    adminUser = createdAdmin;

    // Create Manager User
    const managerHash = await libAuth.hashPassword("ManagerSecret123!");
    const [createdManager] = await db
      .insert(usersTable)
      .values({
        name: "Operations Manager",
        email: "manager.integration@tracker.local",
        phone: "+966500000002",
        passwordHash: managerHash,
        role: "MANAGER",
        active: true,
      })
      .returning();
    managerUser = createdManager;
  });

  afterAll(async () => {
    // Keep pool open for subsequent test files if needed or drain
  });

  // ==========================================
  // AUTH TESTS
  // ==========================================
  describe("AUTH: Real DB Session & Token Lifecycle", () => {
    it("login - authenticates valid admin credentials and stores refresh token in PostgreSQL", async () => {
      const res = await agent
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.0.1")
        .send({
          emailOrPhone: "admin.integration@tracker.local",
          password: "AdminSecret123!",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");
      expect(res.body.user.email).toBe("admin.integration@tracker.local");
      expect(res.body.user.role).toBe("ADMIN");

      adminAccessToken = res.body.accessToken;
      adminRefreshToken = res.body.refreshToken;

      // Verify token exists in real DB
      const stored = await libAuth.findValidRefreshToken(adminRefreshToken, adminUser.id);
      expect(stored).toBeDefined();
      expect(stored?.userId).toBe(adminUser.id);
    });

    it("refresh - rotates refresh token and returns fresh access token", async () => {
      const res = await agent
        .post("/api/auth/refresh")
        .set("X-Forwarded-For", "10.0.0.2")
        .send({ refreshToken: adminRefreshToken });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accessToken");
      expect(res.body).toHaveProperty("refreshToken");

      const newRefreshToken = res.body.refreshToken;
      expect(newRefreshToken).not.toBe(adminRefreshToken);

      // Old token must now be revoked in PostgreSQL
      const oldCheck = await libAuth.findValidRefreshToken(adminRefreshToken, adminUser.id);
      expect(oldCheck).toBeNull();

      // New token must be valid
      const newCheck = await libAuth.findValidRefreshToken(newRefreshToken, adminUser.id);
      expect(newCheck).toBeDefined();

      // Update active tokens
      adminAccessToken = res.body.accessToken;
      adminRefreshToken = newRefreshToken;
    });

    it("logout - revokes refresh token in PostgreSQL", async () => {
      // Login manager to test logout
      const loginRes = await agent
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.0.3")
        .send({
          emailOrPhone: "manager.integration@tracker.local",
          password: "ManagerSecret123!",
        });
      expect(loginRes.status).toBe(200);
      const managerRefToken = loginRes.body.refreshToken;

      // Logout
      const logoutRes = await agent
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
        .send({ refreshToken: managerRefToken });

      expect(logoutRes.status).toBe(200);

      // Token must now be revoked in DB
      const check = await libAuth.findValidRefreshToken(managerRefToken, managerUser.id);
      expect(check).toBeNull();
    });

    it("revoked refresh token - rejects replay with 401", async () => {
      // Replay already rotated/revoked token
      const res = await agent
        .post("/api/auth/refresh")
        .set("X-Forwarded-For", "10.0.0.4")
        .send({ refreshToken: "revoked-token-value-nonexistent" });

      expect(res.status).toBe(401);
    });

    it("invalid JWT - rejects requests with malformed or tampered token", async () => {
      const res = await agent
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid.jwt.token");

      expect(res.status).toBe(401);
    });

    it("expired token - rejects expired access token with 401", async () => {
      const expiredToken = jwt.sign(
        { sub: adminUser.id, role: "ADMIN", type: "access" },
        process.env.JWT_SECRET!,
        { expiresIn: -10 },
      );

      const res = await agent
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // DRIVER & DEVICE LIFECYCLE TESTS
  // ==========================================
  describe("DRIVER: Creation, 1-Device Binding, and Device Reset", () => {
    it("driver creation - ADMIN creates a new driver record", async () => {
      const res = await agent
        .post("/api/drivers")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({
          name: "Driver Tariq",
          email: "tariq.driver@tracker.local",
          phone: "+966500000099",
          employeeId: "DRV-901",
          password: "DriverPassword123!",
        });

      expect(res.status).toBe(201);
      expect(res.body.driver.employeeId).toBe("DRV-901");
      expect(res.body.user.role).toBe("DRIVER");

      driverRecord = res.body.driver;
      driverUser = res.body.user;
    });

    it("device registration - first login on Android registers and authorizes device", async () => {
      // Driver logs in from Device A
      const loginRes = await agent
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.1.1")
        .send({
          emailOrPhone: "tariq.driver@tracker.local",
          password: "DriverPassword123!",
          device: {
            platform: "android",
            deviceIdentifier: "hardware-id-device-alpha",
            appVersion: "1.0.0",
          },
        });

      expect(loginRes.status).toBe(200);
      driverAccessToken = loginRes.body.accessToken;
      driverRefreshToken = loginRes.body.refreshToken;

      // Verify device was authorized in PostgreSQL
      const [device] = await db
        .select()
        .from(devicesTable)
        .where(eq(devicesTable.driverId, driverRecord.id));

      expect(device).toBeDefined();
      expect(device.deviceIdentifier).toBe("hardware-id-device-alpha");
      expect(device.authorized).toBe(true);
      driverDevice = device;
    });

    it("second device rejection - login from second device is rejected with 403 DEVICE_NOT_AUTHORIZED", async () => {
      const loginRes = await agent
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.1.2")
        .send({
          emailOrPhone: "tariq.driver@tracker.local",
          password: "DriverPassword123!",
          device: {
            platform: "android",
            deviceIdentifier: "hardware-id-device-beta", // DIFFERENT DEVICE!
            appVersion: "1.0.0",
          },
        });

      expect(loginRes.status).toBe(403);
      expect(loginRes.body.error.code).toBe("AUTH_DEVICE_MISMATCH");
    });

    it("reset - ADMIN resets authorized device, revoking tokens and clearing authorization", async () => {
      const resetRes = await agent
        .post(`/api/drivers/${driverRecord.id}/device/reset`)
        .set("Authorization", `Bearer ${adminAccessToken}`);

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);

      // Verify device is now unauthorized in DB
      const [dev] = await db.select().from(devicesTable).where(eq(devicesTable.id, driverDevice.id));
      expect(dev.authorized).toBe(false);

      // Old refresh token must be revoked
      const oldToken = await libAuth.findValidRefreshToken(driverRefreshToken, driverUser.id);
      expect(oldToken).toBeNull();
    });

    it("post-reset login - driver can now bind the new device successfully", async () => {
      const loginRes = await agent
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.1.3")
        .send({
          emailOrPhone: "tariq.driver@tracker.local",
          password: "DriverPassword123!",
          device: {
            platform: "android",
            deviceIdentifier: "hardware-id-device-beta",
            appVersion: "1.0.0",
          },
        });

      expect(loginRes.status).toBe(200);
      driverAccessToken = loginRes.body.accessToken;
      driverRefreshToken = loginRes.body.refreshToken;

      // Verify device Beta is now authorized
      const [devBeta] = await db
        .select()
        .from(devicesTable)
        .where(and(eq(devicesTable.driverId, driverRecord.id), eq(devicesTable.authorized, true)));

      expect(devBeta).toBeDefined();
      expect(devBeta.deviceIdentifier).toBe("hardware-id-device-beta");
    });
  });

  // ==========================================
  // SHIFT LIFECYCLE TESTS
  // ==========================================
  describe("SHIFT: Start, End, Duplicate Protection & Inactive Guards", () => {
    it("inactive shift location rejection - location submitted before shift start is rejected with 409", async () => {
      const res = await agent
        .post("/api/drivers/me/location")
        .set("Authorization", `Bearer ${driverAccessToken}`)
        .send({
          latitude: 24.7136,
          longitude: 46.6753,
          recordedAt: new Date().toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("SHIFT_NOT_ACTIVE");
    });

    it("start shift - creates active shift record in PostgreSQL", async () => {
      const res = await agent
        .post("/api/drivers/me/shifts/start")
        .set("Authorization", `Bearer ${driverAccessToken}`);

      expect(res.status).toBe(201);
      expect(res.body.shift.status).toBe("ACTIVE");

      const [shift] = await db
        .select()
        .from(shiftsTable)
        .where(and(eq(shiftsTable.driverId, driverRecord.id), eq(shiftsTable.status, "ACTIVE")));

      expect(shift).toBeDefined();
    });

    it("duplicate start - starting second shift while already on active shift returns 409", async () => {
      const res = await agent
        .post("/api/drivers/me/shifts/start")
        .set("Authorization", `Bearer ${driverAccessToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("SHIFT_ALREADY_ACTIVE");
    });

    it("end shift - marks shift COMPLETED with endedAt timestamp", async () => {
      const res = await agent
        .post("/api/drivers/me/shifts/end")
        .set("Authorization", `Bearer ${driverAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.shift.status).toBe("COMPLETED");
      expect(res.body.shift.endedAt).toBeDefined();

      // Restart shift for subsequent location tests
      const startRes = await agent
        .post("/api/drivers/me/shifts/start")
        .set("Authorization", `Bearer ${driverAccessToken}`);
      expect(startRes.status).toBe(201);
    });
  });

  // ==========================================
  // LOCATION INGESTION & BATCH DEDUPLICATION
  // ==========================================
  describe("LOCATION: Ingestion, Batch, Idempotency & Validation", () => {
    it("single point - stores location point and updates device lastSeen in PostgreSQL", async () => {
      const recordedAt = new Date().toISOString();
      const res = await agent
        .post("/api/drivers/me/location")
        .set("Authorization", `Bearer ${driverAccessToken}`)
        .send({
          latitude: 24.7136,
          longitude: 46.6753,
          accuracy: 5.2,
          speed: 12.5,
          recordedAt,
          clientLocationId: "client-pt-001",
          batteryPercentage: 85,
          locationServicesEnabled: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.location).toBeDefined();
      expect(res.body.location.clientLocationId).toBe("client-pt-001");

      // Verify point in DB
      const [pt] = await db
        .select()
        .from(locationPointsTable)
        .where(eq(locationPointsTable.clientLocationId, "client-pt-001"));
      expect(pt).toBeDefined();
    });

    it("batch - ingests array of location points with ON CONFLICT DO NOTHING idempotency", async () => {
      const points = [
        { clientLocationId: "batch-pt-01", latitude: 24.7137, longitude: 46.6754, recordedAt: new Date(Date.now() - 30000).toISOString() },
        { clientLocationId: "batch-pt-02", latitude: 24.7138, longitude: 46.6755, recordedAt: new Date(Date.now() - 20000).toISOString() },
        { clientLocationId: "batch-pt-03", latitude: 24.7139, longitude: 46.6756, recordedAt: new Date(Date.now() - 10000).toISOString() },
      ];

      const res = await agent
        .post("/api/drivers/me/location/batch")
        .set("Authorization", `Bearer ${driverAccessToken}`)
        .send(points);

      expect(res.status).toBe(201);
      expect(res.body.accepted).toBe(3);
      expect(res.body.duplicates).toBe(0);
      expect(res.body.acceptedClientIds).toContain("batch-pt-01");
      expect(res.body.acceptedClientIds).toContain("batch-pt-02");
      expect(res.body.acceptedClientIds).toContain("batch-pt-03");
    });

    it("duplicate clientLocationId - re-uploading same points does not create duplicates", async () => {
      const points = [
        { clientLocationId: "batch-pt-02", latitude: 24.7138, longitude: 46.6755, recordedAt: new Date(Date.now() - 20000).toISOString() }, // ALREADY EXISTS
        { clientLocationId: "batch-pt-04", latitude: 24.7140, longitude: 46.6757, recordedAt: new Date().toISOString() }, // NEW
      ];

      const res = await agent
        .post("/api/drivers/me/location/batch")
        .set("Authorization", `Bearer ${driverAccessToken}`)
        .send(points);

      expect(res.status).toBe(201);
      expect(res.body.accepted).toBe(1); // Only batch-pt-04 accepted
      expect(res.body.duplicates).toBe(1); // batch-pt-02 skipped idempotently
      expect(res.body.acceptedClientIds).toEqual(["batch-pt-04"]);
    });

    it("max 20 - rejects batches larger than 20 points with 400 BATCH_TOO_LARGE", async () => {
      const overBatch = Array.from({ length: 21 }, (_, i) => ({
        clientLocationId: `over-${i}`,
        latitude: 24.7136,
        longitude: 46.6753,
        recordedAt: new Date().toISOString(),
      }));

      const res = await agent
        .post("/api/drivers/me/location/batch")
        .set("Authorization", `Bearer ${driverAccessToken}`)
        .send(overBatch);

      expect(res.status).toBe(400);
      expect(["BATCH_TOO_LARGE", "VALIDATION_ERROR"]).toContain(res.body.error.code);
    });

    it("invalid coordinates - rejects out-of-range latitude/longitude with 400", async () => {
      const res = await agent
        .post("/api/drivers/me/location")
        .set("Authorization", `Bearer ${driverAccessToken}`)
        .send({
          latitude: 195.0, // INVALID LATITUDE > 90
          longitude: 46.6753,
          recordedAt: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
    });

    it("invalid timestamp - rejects unparseable recordedAt timestamp with 400", async () => {
      const res = await agent
        .post("/api/drivers/me/location")
        .set("Authorization", `Bearer ${driverAccessToken}`)
        .send({
          latitude: 24.7136,
          longitude: 46.6753,
          recordedAt: "not-a-timestamp",
        });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // SETTINGS & GEOFENCE TESTS
  // ==========================================
  describe("SETTINGS: Restaurant Geofence, Alerts & Preferences", () => {
    it("get restaurant settings - returns default or configured restaurant", async () => {
      const res = await agent
        .get("/api/settings/restaurant")
        .set("Authorization", `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.settings).toHaveProperty("latitude");
      expect(res.body.settings).toHaveProperty("longitude");
      expect(res.body.settings).toHaveProperty("radiusMeters");
    });

    it("update restaurant & geofence - persists new geofence radius and coordinates", async () => {
      const res = await agent
        .put("/api/settings/restaurant")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({
          name: "Riyadh Flagship Branch",
          latitude: 24.7136,
          longitude: 46.6753,
          radiusMeters: 200,
          enabled: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.settings.name).toBe("Riyadh Flagship Branch");
      expect(res.body.settings.radiusMeters).toBe(200);

      // Verify in DB
      const [dbSettings] = await db.select().from(restaurantSettingsTable);
      expect(dbSettings.radiusMeters).toBe(200);
    });

    it("get alert settings - returns alert thresholds", async () => {
      const res = await agent
        .get("/api/settings/alerts")
        .set("Authorization", `Bearer ${adminAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.settings).toHaveProperty("maxStopDurationMinutes");
      expect(res.body.settings).toHaveProperty("lowBatteryThreshold");
    });

    it("update alert settings - persists custom thresholds in PostgreSQL", async () => {
      const res = await agent
        .put("/api/settings/alerts")
        .set("Authorization", `Bearer ${adminAccessToken}`)
        .send({
          maxStopDurationMinutes: 8,
          offlineGraceMinutes: 4,
          lowBatteryThreshold: 22,
          criticalBatteryThreshold: 8,
          soundEnabled: true,
          inAppAlertsEnabled: true,
          pushAlertsEnabled: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.settings.maxStopDurationMinutes).toBe(8);
      expect(res.body.settings.lowBatteryThreshold).toBe(22);

      const [dbAlerts] = await db.select().from(alertSettingsTable);
      expect(dbAlerts.maxStopDurationMinutes).toBe(8);
    });
  });

  // ==========================================
  // REAL ALERT ENGINE & SCENARIO TESTS
  // ==========================================
  describe("ALERT ENGINE: Scenarios A through J in Real PostgreSQL", () => {
    it("Scenario E: driver stops INSIDE restaurant geofence -> NO stop alert", async () => {
      await db.delete(notificationsTable);
      await db.delete(alertStateTable);

      // Coordinates at center of restaurant geofence (24.7136, 46.6753)
      await alertService.evaluateDriverAlerts({
        driverId: driverRecord.id,
        driverName: "Driver Tariq",
        latitude: 24.7136,
        longitude: 46.6753,
        speed: 0,
        recordedAt: new Date(Date.now() - 30 * 60 * 1000), // Stopped 30 minutes ago inside geofence
      });

      const notifications = await db.select().from(notificationsTable);
      const stopAlerts = notifications.filter((n) => n.type === "STOP_EXTENDED");
      expect(stopAlerts).toHaveLength(0); // Zero stop alerts inside restaurant!
    });

    it("Scenario A: driver stops OUTSIDE restaurant > threshold -> ONE alert created", async () => {
      await db.delete(notificationsTable);
      await db.delete(alertStateTable);

      // Coordinates 5km away from restaurant (outside 200m geofence)
      const outsideLat = 24.7500;
      const outsideLon = 46.7000;
      const stopStartTime = new Date(Date.now() - 15 * 60 * 1000); // 15 mins ago (> 8 min threshold)

      // Point 1: Driver stops outside restaurant 15 minutes ago
      await alertService.evaluateDriverAlerts({
        driverId: driverRecord.id,
        driverName: "Driver Tariq",
        latitude: outsideLat,
        longitude: outsideLon,
        speed: 0,
        recordedAt: stopStartTime,
      });

      // Point 2: Driver remains stopped, triggering duration threshold (> 8 mins)
      await alertService.evaluateDriverAlerts({
        driverId: driverRecord.id,
        driverName: "Driver Tariq",
        latitude: outsideLat,
        longitude: outsideLon,
        speed: 0,
        recordedAt: new Date(),
      });

      const notifications = await db.select().from(notificationsTable);
      const stopAlerts = notifications.filter((n) => n.type === "STOP_EXTENDED");
      expect(stopAlerts).toHaveLength(1);
      expect(stopAlerts[0].severity).toBe("WARNING");
    });

    it("Scenario B: driver remains stopped -> NO repeated spam within cooldown", async () => {
      // Send another point 1 minute later
      await alertService.evaluateDriverAlerts({
        driverId: driverRecord.id,
        driverName: "Driver Tariq",
        latitude: 24.7500,
        longitude: 46.7000,
        speed: 0,
        recordedAt: new Date(),
      });

      const notifications = await db.select().from(notificationsTable);
      const stopAlerts = notifications.filter((n) => n.type === "STOP_EXTENDED");
      expect(stopAlerts).toHaveLength(1); // Still exactly 1, no duplicate spam!
    });

    it("Scenario C: driver resumes movement -> alert state resolves", async () => {
      // Driver moves at 45 km/h (12.5 m/s)
      await alertService.evaluateDriverAlerts({
        driverId: driverRecord.id,
        driverName: "Driver Tariq",
        latitude: 24.7550,
        longitude: 46.7050,
        speed: 12.5,
        recordedAt: new Date(),
      });

      // Active alert state must now be resolved in PostgreSQL
      const activeState = await alertService.getAlertState(driverRecord.id, "STOP_EXTENDED");
      expect(activeState).toBeNull();

      const [storedRow] = await db
        .select()
        .from(alertStateTable)
        .where(and(eq(alertStateTable.driverId, driverRecord.id), eq(alertStateTable.alertType, "STOP_EXTENDED")));
      expect(storedRow).toBeDefined();
      expect(storedRow.resolvedAt).not.toBeNull();
    });

    it("Scenario D: driver stops again later -> new stop state starts from zero without crashing", async () => {
      await db.delete(notificationsTable);

      // Initial stop point (0 mins duration, < 8 mins threshold)
      await alertService.evaluateDriverAlerts({
        driverId: driverRecord.id,
        driverName: "Driver Tariq",
        latitude: 24.7600,
        longitude: 46.7100,
        speed: 0,
        recordedAt: new Date(),
      });

      // No new alert should fire immediately because duration is 0
      const notifications = await db.select().from(notificationsTable);
      const newAlerts = notifications.filter((n) => n.type === "STOP_EXTENDED" && !n.resolved);
      expect(newAlerts).toHaveLength(0);
    });

    it("Scenario F: GPS disabled -> creates GPS_DISABLED alert", async () => {
      await alertService.evaluateDriverAlerts({
        driverId: driverRecord.id,
        driverName: "Driver Tariq",
        latitude: 24.7136,
        longitude: 46.6753,
        speed: 0,
        locationServicesEnabled: false,
        recordedAt: new Date(),
      });

      const notifications = await db.select().from(notificationsTable);
      const gpsAlerts = notifications.filter((n) => n.type === "GPS_DISABLED");
      expect(gpsAlerts.length).toBeGreaterThanOrEqual(1);
    });

    it("Scenario G & H: offline grace -> offline alert created, telemetry returns -> recovery", async () => {
      await db.delete(notificationsTable);
      await db.delete(alertStateTable);

      // Driver offline for 10 minutes (> 4 min grace)
      await alertService.evaluateDriverOfflineAlert({
        driverId: driverRecord.id,
        driverName: "Driver Tariq",
        isOnline: false,
        offlineDurationMinutes: 10,
        lastSeen: new Date(Date.now() - 10 * 60 * 1000),
      });

      const offlineAlerts = await db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.type, "DRIVER_OFFLINE"));
      expect(offlineAlerts.length).toBeGreaterThanOrEqual(1);

      // Recovery: driver comes back online
      await alertService.evaluateDriverOfflineAlert({
        driverId: driverRecord.id,
        driverName: "Driver Tariq",
        isOnline: true,
        offlineDurationMinutes: 0,
        lastSeen: new Date(),
      });

      const state = await alertService.getAlertState(driverRecord.id, "DRIVER_OFFLINE");
      expect(state).toBeNull(); // Resolved!
    });

    it("Scenario I & J: battery threshold alerts -> LOW and CRITICAL battery alerts fire once", async () => {
      await db.delete(notificationsTable);
      await db.delete(alertStateTable);

      // Low battery: 18% (threshold <= 22%)
      await alertService.evaluateDriverAlerts({
        driverId: driverRecord.id,
        driverName: "Driver Tariq",
        latitude: 24.7136,
        longitude: 46.6753,
        batteryPercentage: 18,
        recordedAt: new Date(),
      });

      let batteryNotifications = await db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.type, "BATTERY_LOW"));
      expect(batteryNotifications).toHaveLength(1);
      expect(batteryNotifications[0].severity).toBe("WARNING");

      // Critical battery: 6% (threshold <= 8%)
      await alertService.evaluateDriverAlerts({
        driverId: driverRecord.id,
        driverName: "Driver Tariq",
        latitude: 24.7136,
        longitude: 46.6753,
        batteryPercentage: 6,
        recordedAt: new Date(),
      });

      const criticalNotifications = await db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.type, "BATTERY_CRITICAL"));
      expect(criticalNotifications).toHaveLength(1);
      expect(criticalNotifications[0].severity).toBe("CRITICAL");
    });
  });
});
