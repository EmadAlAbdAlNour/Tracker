import { pool, db, usersTable } from "@workspace/db";
import bcrypt from "bcryptjs";

async function main() {
  console.log("=== PHASE 2: DATABASE IDENTITY VERIFICATION ===");
  try {
    const rawUrl = process.env.DATABASE_URL || "";
    try {
      const parsed = new URL(rawUrl);
      console.log("Configured DB Host:", parsed.hostname);
      console.log("Configured DB Port:", parsed.port || "5432");
      console.log("Configured DB Name:", parsed.pathname.replace(/^\//, ""));
      console.log("Configured DB User:", parsed.username);
    } catch {
      console.log("Could not parse DATABASE_URL as URL");
    }

    const idRes = await pool.query(`
      SELECT 
        current_database() as db_name,
        current_user as user_name,
        current_schema() as schema_name,
        inet_server_addr() as server_ip,
        version() as pg_version
    `);
    console.log("Postgres Query Results:", idRes.rows[0]);

    console.log("\n=== PHASE 3: DATABASE USER FORENSICS ===");
    const allUsers = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      active: usersTable.active,
      passwordHash: usersTable.passwordHash,
    }).from(usersTable);

    console.log("Total Users in DB:", allUsers.length);
    for (const u of allUsers) {
      console.log({
        email: u.email,
        role: u.role,
        active: u.active,
        hashLength: u.passwordHash ? u.passwordHash.length : 0,
        hashPrefix: u.passwordHash ? u.passwordHash.slice(0, 7) : "NONE",
      });
    }

    console.log("\n=== PHASE 5: DIRECT PASSWORD VERIFICATION ===");
    const testAccounts = [
      "admin@tracker.local",
      "admin.integration@tracker.local",
      "manager1@tracker.local",
      "manager.integration@tracker.local",
      "tariq.driver@tracker.local"
    ];

    const testPassword = "Password123!";

    for (const email of testAccounts) {
      const found = allUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!found) {
        console.log(`${email}: NOT_FOUND`);
      } else {
        const isPw123 = await bcrypt.compare("Password123!", found.passwordHash);
        const isAdminSec = await bcrypt.compare("AdminSecret123!", found.passwordHash);
        const isMgrSec = await bcrypt.compare("ManagerSecret123!", found.passwordHash);
        const isDrvSec = await bcrypt.compare("DriverSecret123!", found.passwordHash);
        console.log(`${email}: Password123!=${isPw123}, AdminSecret123!=${isAdminSec}, ManagerSecret123!=${isMgrSec}, DriverSecret123!=${isDrvSec} (role=${found.role}, active=${found.active})`);
      }
    }

  } catch (err) {
    console.error("Forensic check failed:", err);
  } finally {
    await pool.end();
  }
}

main();
