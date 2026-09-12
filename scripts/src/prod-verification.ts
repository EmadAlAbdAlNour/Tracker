async function runVerification() {
  const prodUrl = "https://tracker-alpha-puce.vercel.app";
  console.log("=== VERIFYING PRODUCTION API ===", prodUrl);

  // 1. Healthz
  const hRes = await fetch(`${prodUrl}/api/healthz`);
  console.log("1. GET /api/healthz =>", hRes.status, await hRes.json());

  // 2. Invalid password
  const badLogin = await fetch(`${prodUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailOrPhone: "admin.integration@tracker.local",
      password: "WrongPassword!",
    }),
  });
  console.log("2. POST /api/auth/login (invalid pw) =>", badLogin.status, await badLogin.json());

  // 3. Nonexistent user
  const nonExistent = await fetch(`${prodUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailOrPhone: "ghost@tracker.local",
      password: "Password123!",
    }),
  });
  console.log("3. POST /api/auth/login (nonexistent user) =>", nonExistent.status, await nonExistent.json());

  // 4. Valid Admin login with admin.integration@tracker.local
  const validLogin = await fetch(`${prodUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      emailOrPhone: "admin.integration@tracker.local",
      password: "AdminSecret123!",
    }),
  });
  console.log("4. POST /api/auth/login (valid admin) =>", validLogin.status);
  const loginData = (await validLogin.json()) as any;
  console.log("   User role:", loginData.user?.role, "Email:", loginData.user?.email);
  const accessToken = loginData.accessToken;
  const refreshToken = loginData.refreshToken;

  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // 5. GET /api/users
  const usersRes = await fetch(`${prodUrl}/api/users?page=1&limit=15`, { headers: authHeader });
  console.log("5. GET /api/users =>", usersRes.status);

  // 6. GET /api/fleet/live
  const fleetRes = await fetch(`${prodUrl}/api/fleet/live`, { headers: authHeader });
  console.log("6. GET /api/fleet/live =>", fleetRes.status);

  // 7. GET /api/notifications
  const notifRes = await fetch(`${prodUrl}/api/notifications?page=1&limit=15`, { headers: authHeader });
  console.log("7. GET /api/notifications =>", notifRes.status);

  // 8. GET /api/settings/restaurant
  const restRes = await fetch(`${prodUrl}/api/settings/restaurant`, { headers: authHeader });
  console.log("8. GET /api/settings/restaurant =>", restRes.status);

  // 9. GET /api/settings/alerts
  const alertRes = await fetch(`${prodUrl}/api/settings/alerts`, { headers: authHeader });
  console.log("9. GET /api/settings/alerts =>", alertRes.status);

  // 10. POST /api/auth/refresh
  const refRes = await fetch(`${prodUrl}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  console.log("10. POST /api/auth/refresh =>", refRes.status);
  const refData = (await refRes.json()) as any;
  const newRefreshToken = refData.refreshToken;

  // 11. Replay revoked refresh token
  const replayRes = await fetch(`${prodUrl}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  console.log("11. Replay revoked refreshToken =>", replayRes.status, await replayRes.json());

  // 12. Malformed refresh token
  const malformedRes = await fetch(`${prodUrl}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: "not-a-jwt-token" }),
  });
  console.log("12. Malformed refreshToken =>", malformedRes.status, await malformedRes.json());
}

runVerification().catch(console.error);

