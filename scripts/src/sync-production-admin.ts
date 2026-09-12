import { pool } from "@workspace/db";
import bcrypt from "bcryptjs";

async function syncAdmin() {
  console.log("=== OPERATIONAL TASK: SYNC PRODUCTION ADMIN ACCOUNTS ===");

  const targetPassword = "Password123!";
  const newHash = await bcrypt.hash(targetPassword, 12);

  // 1. Ensure admin@tracker.local exists
  const existingPrimary = await pool.query(
    "SELECT id, email, role, active, password_hash FROM users WHERE email = $1",
    ["admin@tracker.local"]
  );

  if (existingPrimary.rows.length === 0) {
    console.log("Creating primary admin: admin@tracker.local...");
    const insertRes = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, role, active`,
      ["System Administrator", "admin@tracker.local", "+966500000001", newHash, "ADMIN", true]
    );
    console.log("Created admin@tracker.local successfully (id:", insertRes.rows[0].id, ")");
  } else {
    console.log("admin@tracker.local already exists. Ensuring active and ADMIN role with target password...");
    await pool.query(
      `UPDATE users 
       SET role = 'ADMIN', active = true, password_hash = $1, updated_at = NOW() 
       WHERE email = $2`,
      [newHash, "admin@tracker.local"]
    );
    console.log("Updated admin@tracker.local successfully.");
  }

  // 2. Also align admin.integration@tracker.local password so Password123! works for both accounts
  const existingIntegration = await pool.query(
    "SELECT id, email, role, active, password_hash FROM users WHERE email = $1",
    ["admin.integration@tracker.local"]
  );

  if (existingIntegration.rows.length > 0) {
    console.log("Aligning admin.integration@tracker.local password to target password...");
    await pool.query(
      `UPDATE users 
       SET role = 'ADMIN', active = true, password_hash = $1, updated_at = NOW() 
       WHERE email = $2`,
      [newHash, "admin.integration@tracker.local"]
    );
    console.log("Updated admin.integration@tracker.local successfully.");
  }

  // 3. Verification
  console.log("\n=== POST-SYNC BCRYPT VERIFICATION ===");
  const allUsers = await pool.query("SELECT id, email, role, active, password_hash FROM users ORDER BY created_at ASC");
  for (const u of allUsers.rows) {
    const match = await bcrypt.compare(targetPassword, u.password_hash);
    console.log(`User ${u.email}: role=${u.role}, active=${u.active}, Password123! matches: ${match}`);
  }

  await pool.end();
}

syncAdmin().catch((err) => {
  console.error("syncAdmin failed:", err);
  process.exit(1);
});

