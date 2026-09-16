async function main() {
  const prodUrl = "https://tracker-alpha-puce.vercel.app";
  // 1. Admin login
  const adminLogin = await fetch(`${prodUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailOrPhone: "admin.integration@tracker.local", password: "Password123!" }),
  });
  const { accessToken } = await adminLogin.json() as any;

  // 2. Admin resets driver password to DriverSecret123!
  const updateRes = await fetch(`${prodUrl}/api/users/66aa78e7-e788-4d53-8bba-4c4a41eee622`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ password: "DriverSecret123!" }),
  });
  console.log("Admin PATCH /api/users/:id password status:", updateRes.status);

  // 3. Driver login test
  const driverLogin = await fetch(`${prodUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  console.log("Driver login status:", driverLogin.status);
  const drvData = await driverLogin.json() as any;
  console.log("Driver user:", drvData.user?.role, drvData.user?.name);
}

main().catch(console.error);
