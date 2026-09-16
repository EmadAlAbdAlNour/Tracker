import { pool } from "@workspace/db";

const PROD_URL = "https://tracker-alpha-puce.vercel.app";

interface TestResult {
  feature: string;
  role: string;
  test: string;
  expected: string;
  actual: string;
  evidence: string;
  status: "PASS" | "FAIL" | "BLOCKED" | "NOT APPLICABLE";
}

const results: TestResult[] = [];

function record(res: TestResult) {
  results.push(res);
  console.log(`[${res.status}] ${res.role} - ${res.test}`);
  if (res.status === "FAIL") {
    console.error(`  Expected: ${res.expected}`);
    console.error(`  Actual:   ${res.actual}`);
  }
}

async function api(path: string, options: RequestInit = {}) {
  let res = await fetch(`${PROD_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after") || 5);
    console.log(`[RATE_LIMITED] Waiting ${retryAfter + 1}s before retry...`);
    await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
    res = await fetch(`${PROD_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }
  const data: any = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data: data as any };
}

async function runE2E() {
  console.log("=== STARTING TRACKER FINAL PRODUCT ACCEPTANCE E2E HARNESS ===");

  // -------------------------------------------------------------
  // PHASE 2 & 21: ADMIN ACCEPTANCE & RBAC
  // -------------------------------------------------------------
  const adminLogin = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      emailOrPhone: "admin.integration@tracker.local",
      password: "Password123!",
    }),
  });

  if (adminLogin.status === 200 && adminLogin.data?.user?.role === "ADMIN") {
    record({
      feature: "Authentication",
      role: "ADMIN",
      test: "Admin Login with valid credentials",
      expected: "HTTP 200 with ADMIN user payload and tokens",
      actual: `HTTP ${adminLogin.status}, role=${adminLogin.data?.user?.role}`,
      evidence: JSON.stringify({ user: adminLogin.data.user }),
      status: "PASS",
    });
  } else {
    record({
      feature: "Authentication",
      role: "ADMIN",
      test: "Admin Login with valid credentials",
      expected: "HTTP 200 with ADMIN user payload",
      actual: `HTTP ${adminLogin.status}: ${JSON.stringify(adminLogin.data)}`,
      evidence: "Failed login",
      status: "FAIL",
    });
    return;
  }

  const adminToken = adminLogin.data.accessToken;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // Admin Fleet
  const adminFleet = await api("/api/fleet/live", { headers: adminHeaders });
  record({
    feature: "Fleet Monitoring",
    role: "ADMIN",
    test: "Fetch live fleet overview",
    expected: "HTTP 200 with summary and drivers list",
    actual: `HTTP ${adminFleet.status}, totalDrivers=${adminFleet.data?.summary?.totalDrivers}`,
    evidence: JSON.stringify(adminFleet.data?.summary),
    status: adminFleet.status === 200 && adminFleet.data?.summary ? "PASS" : "FAIL",
  });

  // Admin Users List
  const adminUsers = await api("/api/users?limit=50", { headers: adminHeaders });
  record({
    feature: "User Management",
    role: "ADMIN",
    test: "List all users",
    expected: "HTTP 200 with user list",
    actual: `HTTP ${adminUsers.status}, count=${adminUsers.data?.items?.length}`,
    evidence: `Users returned: ${adminUsers.data?.items?.length}`,
    status: adminUsers.status === 200 ? "PASS" : "FAIL",
  });

  // Admin Devices List
  const adminDevices = await api("/api/devices?limit=50", { headers: adminHeaders });
  record({
    feature: "Device Management",
    role: "ADMIN",
    test: "List all registered driver devices",
    expected: "HTTP 200 with device list",
    actual: `HTTP ${adminDevices.status}, count=${adminDevices.data?.items?.length}`,
    evidence: `Devices returned: ${adminDevices.data?.items?.length}`,
    status: adminDevices.status === 200 ? "PASS" : "FAIL",
  });

  // Admin Settings Inspection
  const adminRestSettings = await api("/api/settings/restaurant", { headers: adminHeaders });
  const adminAlertSettings = await api("/api/settings/alerts", { headers: adminHeaders });
  record({
    feature: "Settings Inspection",
    role: "ADMIN",
    test: "Inspect restaurant and alert settings",
    expected: "HTTP 200 for both restaurant and alert settings",
    actual: `Restaurant: ${adminRestSettings.status}, Alerts: ${adminAlertSettings.status}`,
    evidence: JSON.stringify({ rest: adminRestSettings.data?.settings, alerts: adminAlertSettings.data?.settings }),
    status: adminRestSettings.status === 200 && adminAlertSettings.status === 200 ? "PASS" : "FAIL",
  });

  // -------------------------------------------------------------
  // PHASE 3 & 21: CALL_CENTER ACCEPTANCE & SECURITY BOUNDARIES
  // -------------------------------------------------------------
  const ccLogin = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      emailOrPhone: "manager.integration@tracker.local",
      password: "ManagerSecret123!",
    }),
  });

  record({
    feature: "Authentication",
    role: "CALL_CENTER",
    test: "Call Center Login",
    expected: "HTTP 200 with CALL_CENTER user role",
    actual: `HTTP ${ccLogin.status}, role=${ccLogin.data?.user?.role}`,
    evidence: JSON.stringify({ user: ccLogin.data?.user }),
    status: ccLogin.status === 200 && ccLogin.data?.user?.role === "CALL_CENTER" ? "PASS" : "FAIL",
  });

  const ccToken = ccLogin.data?.accessToken;
  const ccHeaders = { Authorization: `Bearer ${ccToken}` };

  // Call Center can view fleet
  const ccFleet = await api("/api/fleet/live", { headers: ccHeaders });
  record({
    feature: "Fleet Monitoring",
    role: "CALL_CENTER",
    test: "Call Center view live fleet",
    expected: "HTTP 200 with fleet summary",
    actual: `HTTP ${ccFleet.status}`,
    evidence: JSON.stringify(ccFleet.data?.summary),
    status: ccFleet.status === 200 ? "PASS" : "FAIL",
  });

  // Call Center CANNOT list users (Admin only)
  const ccUsersBlocked = await api("/api/users", { headers: ccHeaders });
  record({
    feature: "Role Security (RBAC)",
    role: "CALL_CENTER",
    test: "Call Center attempt to list users (Blocked)",
    expected: "HTTP 403 AUTH_FORBIDDEN",
    actual: `HTTP ${ccUsersBlocked.status}: ${ccUsersBlocked.data?.error?.code}`,
    evidence: JSON.stringify(ccUsersBlocked.data),
    status: ccUsersBlocked.status === 403 ? "PASS" : "FAIL",
  });

  // Call Center CANNOT mutate settings
  const ccSettingsBlocked = await api("/api/settings/restaurant", {
    method: "PUT",
    headers: ccHeaders,
    body: JSON.stringify({ name: "Hacked Restaurant" }),
  });
  record({
    feature: "Role Security (RBAC)",
    role: "CALL_CENTER",
    test: "Call Center attempt to mutate restaurant settings (Blocked)",
    expected: "HTTP 403 AUTH_FORBIDDEN",
    actual: `HTTP ${ccSettingsBlocked.status}: ${ccSettingsBlocked.data?.error?.code}`,
    evidence: JSON.stringify(ccSettingsBlocked.data),
    status: ccSettingsBlocked.status === 403 ? "PASS" : "FAIL",
  });

  // Call Center CANNOT reset devices
  const ccResetBlocked = await api("/api/drivers/145a5cec-52e8-45d7-a51b-fdadffd4059f/device/reset", {
    method: "POST",
    headers: ccHeaders,
  });
  record({
    feature: "Role Security (RBAC)",
    role: "CALL_CENTER",
    test: "Call Center attempt to reset driver device (Blocked)",
    expected: "HTTP 403 AUTH_FORBIDDEN",
    actual: `HTTP ${ccResetBlocked.status}: ${ccResetBlocked.data?.error?.code}`,
    evidence: JSON.stringify(ccResetBlocked.data),
    status: ccResetBlocked.status === 403 ? "PASS" : "FAIL",
  });

  // -------------------------------------------------------------
  // PHASE 4, 5, 10, 13: DRIVER ACCEPTANCE, SHIFT, REAL TELEMETRY E2E
  // -------------------------------------------------------------
  const driverLogin = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      emailOrPhone: "emad@tracker.local",
      password: "DriverSecret123!",
      device: {
        platform: "android",
        deviceIdentifier: "759dc1f3-1c56-4271-beb0-86334c15720c",
        appVersion: "1.0.0",
      },
    }),
  });

  record({
    feature: "Authentication",
    role: "DRIVER",
    test: "Driver Login with device binding",
    expected: "HTTP 200 with DRIVER user payload and tokens",
    actual: `HTTP ${driverLogin.status}, role=${driverLogin.data?.user?.role}`,
    evidence: JSON.stringify({ user: driverLogin.data?.user }),
    status: driverLogin.status === 200 && driverLogin.data?.user?.role === "DRIVER" ? "PASS" : "FAIL",
  });

  const driverToken = driverLogin.data?.accessToken;
  const driverHeaders = { Authorization: `Bearer ${driverToken}` };

  // Driver me profile
  const driverProfile = await api("/api/drivers/me", { headers: driverHeaders });
  record({
    feature: "Driver Profile",
    role: "DRIVER",
    test: "Fetch driver profile",
    expected: "HTTP 200 with driver profile and employee ID",
    actual: `HTTP ${driverProfile.status}, employeeId=${driverProfile.data?.driver?.employeeId}`,
    evidence: JSON.stringify(driverProfile.data?.driver),
    status: driverProfile.status === 200 && driverProfile.data?.driver?.employeeId === "01" ? "PASS" : "FAIL",
  });

  // Ensure any previous active shift is cleanly closed
  const existingActiveShifts = await api("/api/drivers/me/shifts?status=ACTIVE", { headers: driverHeaders });
  if (existingActiveShifts.data?.items?.length > 0) {
    await api("/api/drivers/me/shifts/end", { method: "POST", headers: driverHeaders });
  }

  // Verify OFF_DUTY
  const offDutyShifts = await api("/api/drivers/me/shifts?status=ACTIVE", { headers: driverHeaders });
  record({
    feature: "Shift Lifecycle",
    role: "DRIVER",
    test: "Verify initial state is OFF_DUTY (no active shifts)",
    expected: "0 active shifts",
    actual: `${offDutyShifts.data?.items?.length ?? 0} active shifts`,
    evidence: JSON.stringify(offDutyShifts.data),
    status: offDutyShifts.data?.items?.length === 0 ? "PASS" : "FAIL",
  });

  // Attempt to submit location while OFF_DUTY (Should be rejected with 409 SHIFT_NOT_ACTIVE)
  const offDutyLocation = await api("/api/drivers/me/location", {
    method: "POST",
    headers: driverHeaders,
    body: JSON.stringify({
      latitude: 30.4187,
      longitude: 31.5627,
      recordedAt: new Date().toISOString(),
    }),
  });
  record({
    feature: "Shift Integrity",
    role: "DRIVER",
    test: "Reject location submission when OFF_DUTY",
    expected: "HTTP 409 SHIFT_NOT_ACTIVE",
    actual: `HTTP ${offDutyLocation.status}: ${offDutyLocation.data?.error?.code}`,
    evidence: JSON.stringify(offDutyLocation.data),
    status: offDutyLocation.status === 409 ? "PASS" : "FAIL",
  });

  // Start Driver Shift -> SHIFT_ACTIVE
  const startShiftRes = await api("/api/drivers/me/shifts/start", {
    method: "POST",
    headers: driverHeaders,
  });
  record({
    feature: "Shift Lifecycle",
    role: "DRIVER",
    test: "Start driver shift -> SHIFT_ACTIVE",
    expected: "HTTP 200/201 with shift in ACTIVE status",
    actual: `HTTP ${startShiftRes.status}, status=${startShiftRes.data?.shift?.status}`,
    evidence: JSON.stringify(startShiftRes.data?.shift),
    status: (startShiftRes.status === 200 || startShiftRes.status === 201) && startShiftRes.data?.shift?.status === "ACTIVE" ? "PASS" : "FAIL",
  });

  const activeShiftId = startShiftRes.data?.shift?.id;

  // Duplicate Start Shift Rejection
  const dupShift = await api("/api/drivers/me/shifts/start", {
    method: "POST",
    headers: driverHeaders,
  });
  record({
    feature: "Shift Integrity",
    role: "DRIVER",
    test: "Reject starting shift when shift is already active",
    expected: "HTTP 409 SHIFT_ALREADY_ACTIVE",
    actual: `HTTP ${dupShift.status}: ${dupShift.data?.error?.code}`,
    evidence: JSON.stringify(dupShift.data),
    status: dupShift.status === 409 ? "PASS" : "FAIL",
  });

  // REAL GPS E2E PIPELINE TRACE
  // Point 1: At 30.245000, 31.482000 (Moving, Speed 8.5 m/s = 30.6 km/h, Heading 45 deg, Battery 68%, Charging false)
  const tracePointId = `trace-e2e-${Date.now()}`;
  const traceTime = new Date().toISOString();
  const point1Res = await api("/api/drivers/me/location", {
    method: "POST",
    headers: driverHeaders,
    body: JSON.stringify({
      clientLocationId: tracePointId,
      latitude: 30.245123,
      longitude: 31.482456,
      accuracy: 6.2,
      altitude: 142.5,
      speed: 8.5,
      heading: 45.0,
      recordedAt: traceTime,
      source: "mobile",
      batteryPercentage: 68,
      isCharging: false,
      locationServicesEnabled: true,
      networkStatus: "cellular",
    }),
  });

  record({
    feature: "Real GPS E2E Pipeline",
    role: "DRIVER",
    test: "Upload real location telemetry point",
    expected: "HTTP 200/201 with stored point record",
    actual: `HTTP ${point1Res.status}`,
    evidence: JSON.stringify(point1Res.data),
    status: (point1Res.status === 200 || point1Res.status === 201) ? "PASS" : "FAIL",
  });

  // Verify Point in Database directly via Neon pool
  const dbCheck = await pool.query(
    "SELECT * FROM location_points WHERE client_location_id = $1",
    [tracePointId]
  );
  record({
    feature: "Data Persistence",
    role: "DRIVER",
    test: "Direct Database verification of uploaded GPS point",
    expected: "1 row found with exact coordinates and telemetry",
    actual: `${dbCheck.rows.length} rows found in PostgreSQL`,
    evidence: JSON.stringify(dbCheck.rows[0]),
    status: dbCheck.rows.length === 1 && Number(dbCheck.rows[0].latitude) === 30.245123 ? "PASS" : "FAIL",
  });

  // Verify Fleet Live reflection (Driver Operational State, Location, Battery, Speed)
  const fleetCheck = await api("/api/fleet/live", { headers: adminHeaders });
  const emadDriverInFleet = fleetCheck.data?.drivers?.find((d: any) => d.driverId === "145a5cec-52e8-45d7-a51b-fdadffd4059f");
  record({
    feature: "Live Fleet Sync",
    role: "ADMIN",
    test: "Verify uploaded telemetry reflects in GET /api/fleet/live",
    expected: "Driver moving, speed=8.5m/s, battery=68%, latitude=30.245123",
    actual: `Status: ${emadDriverInFleet?.operationalStatus}, Lat: ${emadDriverInFleet?.location?.latitude}, Battery: ${emadDriverInFleet?.device?.batteryPercentage}%`,
    evidence: JSON.stringify(emadDriverInFleet),
    status: emadDriverInFleet?.operationalStatus === "MOVING" && emadDriverInFleet?.device?.batteryPercentage === 68 ? "PASS" : "FAIL",
  });

  // Batch Location Upload (Simulate local queue flush after network recovery)
  const batchPoints = [
    {
      clientLocationId: `batch-1-${Date.now()}`,
      latitude: 30.246000,
      longitude: 31.483000,
      accuracy: 5.0,
      speed: 10.2,
      heading: 50.0,
      recordedAt: new Date(Date.now() - 10000).toISOString(),
      batteryPercentage: 67,
      isCharging: false,
    },
    {
      clientLocationId: `batch-2-${Date.now()}`,
      latitude: 30.247000,
      longitude: 31.484000,
      accuracy: 4.8,
      speed: 12.0,
      heading: 55.0,
      recordedAt: new Date(Date.now() - 5000).toISOString(),
      batteryPercentage: 67,
      isCharging: false,
    },
  ];

  const batchRes = await api("/api/drivers/me/location/batch", {
    method: "POST",
    headers: driverHeaders,
    body: JSON.stringify(batchPoints),
  });

  record({
    feature: "Batch Location Upload",
    role: "DRIVER",
    test: "Submit batch location telemetry (offline queue replay)",
    expected: "HTTP 200/201 with accepted=2, duplicates=0",
    actual: `HTTP ${batchRes.status}, accepted=${batchRes.data?.accepted}, duplicates=${batchRes.data?.duplicates}`,
    evidence: JSON.stringify(batchRes.data),
    status: (batchRes.status === 200 || batchRes.status === 201) && batchRes.data?.accepted === 2 ? "PASS" : "FAIL",
  });

  // Duplicate Batch Submission (Idempotency test)
  const dupBatchRes = await api("/api/drivers/me/location/batch", {
    method: "POST",
    headers: driverHeaders,
    body: JSON.stringify(batchPoints),
  });
  record({
    feature: "Batch Location Idempotency",
    role: "DRIVER",
    test: "Resubmit same batch without duplicates",
    expected: "HTTP 200/201 with accepted=0, duplicates=2",
    actual: `HTTP ${dupBatchRes.status}, accepted=${dupBatchRes.data?.accepted}, duplicates=${dupBatchRes.data?.duplicates}`,
    evidence: JSON.stringify(dupBatchRes.data),
    status: (dupBatchRes.status === 200 || dupBatchRes.status === 201) && dupBatchRes.data?.duplicates === 2 ? "PASS" : "FAIL",
  });

  // -------------------------------------------------------------
  // PHASE 14: DEVICE REVOCATION & ENFORCEMENT
  // -------------------------------------------------------------
  // Admin resets driver device
  const resetRes = await api("/api/drivers/145a5cec-52e8-45d7-a51b-fdadffd4059f/device/reset", {
    method: "POST",
    headers: adminHeaders,
  });
  record({
    feature: "Device Authorization",
    role: "ADMIN",
    test: "Admin resets driver device authorization",
    expected: "HTTP 200 device reset success",
    actual: `HTTP ${resetRes.status}`,
    evidence: JSON.stringify(resetRes.data),
    status: resetRes.status === 200 ? "PASS" : "FAIL",
  });

  // Immediately test Driver Device A (Must fail with 403 DEVICE_UNAUTHORIZED)
  const revokedLocationRes = await api("/api/drivers/me/location", {
    method: "POST",
    headers: driverHeaders,
    body: JSON.stringify({
      latitude: 30.248000,
      longitude: 31.485000,
      recordedAt: new Date().toISOString(),
    }),
  });
  record({
    feature: "Device Revocation Enforcement",
    role: "DRIVER",
    test: "Upload telemetry from revoked device with active JWT (Blocked)",
    expected: "HTTP 403 DEVICE_UNAUTHORIZED",
    actual: `HTTP ${revokedLocationRes.status}: ${revokedLocationRes.data?.error?.code}`,
    evidence: JSON.stringify(revokedLocationRes.data),
    status: revokedLocationRes.status === 403 && revokedLocationRes.data?.error?.code === "DEVICE_UNAUTHORIZED" ? "PASS" : "FAIL",
  });

  // Driver login again to re-authorize device
  const rebindLogin = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      emailOrPhone: "emad@tracker.local",
      password: "DriverSecret123!",
      device: {
        platform: "android",
        deviceIdentifier: "759dc1f3-1c56-4271-beb0-86334c15720c",
        appVersion: "1.0.0",
      },
    }),
  });
  const rebindToken = rebindLogin.data?.accessToken;
  const rebindHeaders = { Authorization: `Bearer ${rebindToken}` };
  record({
    feature: "Device Re-authorization",
    role: "DRIVER",
    test: "Driver logs in to bind new authorized device session",
    expected: "HTTP 200 successfully authorized",
    actual: `HTTP ${rebindLogin.status}`,
    evidence: JSON.stringify({ user: rebindLogin.data?.user }),
    status: rebindLogin.status === 200 ? "PASS" : "FAIL",
  });

  // Telemetry succeeds again
  const restoredLocation = await api("/api/drivers/me/location", {
    method: "POST",
    headers: rebindHeaders,
    body: JSON.stringify({
      latitude: 30.248000,
      longitude: 31.485000,
      speed: 5.0,
      heading: 90.0,
      recordedAt: new Date().toISOString(),
      batteryPercentage: 66,
      isCharging: false,
    }),
  });
  record({
    feature: "Device Re-authorization",
    role: "DRIVER",
    test: "Upload telemetry after re-authorization",
    expected: "HTTP 200/201 accepted",
    actual: `HTTP ${restoredLocation.status}`,
    evidence: JSON.stringify(restoredLocation.data),
    status: (restoredLocation.status === 200 || restoredLocation.status === 201) ? "PASS" : "FAIL",
  });

  // -------------------------------------------------------------
  // PHASE 17: SETTINGS PERSISTENCE & BOUNDS
  // -------------------------------------------------------------
  const validSettingsPayload = {
    name: "Al Shayeb Restaurant Main",
    latitude: 30.418797,
    longitude: 31.562741,
    radiusMeters: 500,
  };
  const saveRestSettings = await api("/api/settings/restaurant", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify(validSettingsPayload),
  });
  record({
    feature: "Settings Persistence",
    role: "ADMIN",
    test: "Mutate restaurant settings with valid values",
    expected: "HTTP 200 with persisted settings",
    actual: `HTTP ${saveRestSettings.status}, name=${saveRestSettings.data?.settings?.name}`,
    evidence: JSON.stringify(saveRestSettings.data?.settings),
    status: saveRestSettings.status === 200 && saveRestSettings.data?.settings?.radiusMeters === 500 ? "PASS" : "FAIL",
  });

  // Reject invalid restaurant settings (negative radius, invalid coords)
  const invalidSettings = await api("/api/settings/restaurant", {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "",
      latitude: 200,
      longitude: -300,
      radiusMeters: -50,
    }),
  });
  record({
    feature: "Settings Validation",
    role: "ADMIN",
    test: "Reject out-of-bounds restaurant settings",
    expected: "HTTP 400 VALIDATION_ERROR",
    actual: `HTTP ${invalidSettings.status}: ${invalidSettings.data?.error?.code}`,
    evidence: JSON.stringify(invalidSettings.data),
    status: invalidSettings.status === 400 ? "PASS" : "FAIL",
  });

  // -------------------------------------------------------------
  // PHASE 16: NOTIFICATIONS SCOPING & ISOLATION
  // -------------------------------------------------------------
  const adminNotifs = await api("/api/notifications?limit=20", { headers: adminHeaders });
  record({
    feature: "Notifications",
    role: "ADMIN",
    test: "Fetch user-scoped notifications",
    expected: "HTTP 200 with items array and unreadCount",
    actual: `HTTP ${adminNotifs.status}, items=${adminNotifs.data?.items?.length}, unread=${adminNotifs.data?.unreadCount}`,
    evidence: `Count: ${adminNotifs.data?.items?.length}`,
    status: adminNotifs.status === 200 && Array.isArray(adminNotifs.data?.items) ? "PASS" : "FAIL",
  });

  // End driver shift cleanly
  const endShiftRes = await api("/api/drivers/me/shifts/end", {
    method: "POST",
    headers: rebindHeaders,
  });
  record({
    feature: "Shift Lifecycle",
    role: "DRIVER",
    test: "End driver shift -> OFF_DUTY",
    expected: "HTTP 200 with completed shift",
    actual: `HTTP ${endShiftRes.status}, status=${endShiftRes.data?.shift?.status}`,
    evidence: JSON.stringify(endShiftRes.data?.shift),
    status: endShiftRes.status === 200 && endShiftRes.data?.shift?.status === "COMPLETED" ? "PASS" : "FAIL",
  });

  console.log("\n=== E2E HARNESS EXECUTION FINISHED ===");
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  console.log(`TOTAL: ${results.length} | PASS: ${passCount} | FAIL: ${failCount}`);
}

runE2E().catch(console.error).finally(() => pool.end());
