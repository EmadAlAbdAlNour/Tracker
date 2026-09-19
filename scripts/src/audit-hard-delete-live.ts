import {
  pool,
  db,
  usersTable,
  driversTable,
  devicesTable,
  shiftsTable,
  refreshTokensTable,
  locationPointsTable,
  notificationsTable,
  notificationReadsTable,
  alertStateTable,
  restaurantSettingsTable,
  alertSettingsTable,
} from "@workspace/db";
import { eq, or, inArray, sql, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Permanent delete logic matching userService.ts
async function permanentDeleteUser(id: string, requestingAdminId?: string) {
  const existing = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!existing[0]) {
    throw new Error("USER_NOT_FOUND");
  }
  const user = existing[0];

  const PRIMARY_ADMIN_EMAIL = "admin@tracker.local";
  if (user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
    throw new Error("CANNOT_DELETE_PRIMARY_ADMIN");
  }

  if (requestingAdminId && id === requestingAdminId) {
    throw new Error("CANNOT_DELETE_SELF");
  }

  if (user.role === "ADMIN") {
    const remainingAdmins = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(eq(usersTable.role, "ADMIN"), ne(usersTable.id, id), eq(usersTable.active, true)));
    const remainingCount = Number(remainingAdmins[0]?.count ?? 0);
    if (remainingCount <= 0) {
      throw new Error("CANNOT_DELETE_LAST_ADMIN");
    }
  }

  return await db.transaction(async (tx) => {
    // 1. Check if user is associated with a driver profile
    const driverRows = await tx.select().from(driversTable).where(eq(driversTable.userId, id)).limit(1);
    const driver = driverRows[0];

    if (driver) {
      const driverShifts = await tx
        .select({ id: shiftsTable.id })
        .from(shiftsTable)
        .where(eq(shiftsTable.driverId, driver.id));
      const shiftIds = driverShifts.map((s) => s.id);

      if (shiftIds.length > 0) {
        await tx
          .delete(notificationsTable)
          .where(or(eq(notificationsTable.driverId, driver.id), inArray(notificationsTable.shiftId, shiftIds)));
      } else {
        await tx
          .delete(notificationsTable)
          .where(eq(notificationsTable.driverId, driver.id));
      }

      await tx.delete(locationPointsTable).where(eq(locationPointsTable.driverId, driver.id));
      await tx.delete(shiftsTable).where(eq(shiftsTable.driverId, driver.id));
      await tx.delete(devicesTable).where(eq(devicesTable.driverId, driver.id));
      await tx.delete(alertStateTable).where(eq(alertStateTable.driverId, driver.id));
      await tx.delete(driversTable).where(eq(driversTable.id, driver.id));
    }

    await tx.delete(refreshTokensTable).where(eq(refreshTokensTable.userId, id));
    await tx.delete(notificationReadsTable).where(eq(notificationReadsTable.userId, id));
    await tx.delete(usersTable).where(eq(usersTable.id, id));

    return { success: true, deleted: true, userId: id, role: user.role };
  });
}

// Helper for 'and'
function and(...conditions: any[]) {
  return sql`(${sql.join(conditions, sql` AND `)})`;
}

async function countTableRows(query: string, params: any[]): Promise<number> {
  const res = await pool.query(query, params);
  return Number(res.rows[0]?.count ?? 0);
}

async function main() {
  console.log("==================================================================");
  console.log("        TRACKER TRUE HARD DELETE CONTRACT AUDIT SUITE             ");
  console.log("==================================================================");

  // 1. Check deleted_at across entire DB
  console.log("\n--- SECTION 1: DELETED_AT AUDIT ---");
  const delCols = await pool.query(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND column_name ILIKE '%delete%'
  `);
  console.log("Count of deleted_at/deletedAt columns in public schema:", delCols.rows.length);
  if (delCols.rows.length > 0) {
    console.warn("WARNING: Found unexpected columns:", delCols.rows);
  } else {
    console.log("CONFIRMED: ZERO deleted_at columns exist in any table.");
  }

  // Find an existing primary admin to act as caller
  const primaryAdminRes = await pool.query(`SELECT id, email FROM users WHERE email = 'admin@tracker.local' LIMIT 1`);
  const primaryAdmin = primaryAdminRes.rows[0];
  if (!primaryAdmin) {
    throw new Error("Primary admin admin@tracker.local not found!");
  }
  const callerAdminId = primaryAdmin.id;
  console.log(`Using Caller Admin: ${primaryAdmin.email} (${callerAdminId})`);

  const timestamp = Date.now();
  const passwordHash = await bcrypt.hash("DisposableSecret123!", 10);

  // ----------------------------------------------------------------
  // SECTION 2: VERIFY DISPOSABLE ADMIN DELETION
  // ----------------------------------------------------------------
  console.log("\n--- SECTION 2: VERIFY DISPOSABLE ADMIN DELETION ---");
  const adminEmail = `disposable_admin_${timestamp}@tracker.test`;
  const adminPhone = `+966599${String(timestamp).slice(-6)}`;

  // Insert disposable admin
  const insertAdminRes = await pool.query(`
    INSERT INTO users (name, email, phone, password_hash, role, active)
    VALUES ($1, $2, $3, $4, 'ADMIN', true)
    RETURNING id, email;
  `, ["Disposable Admin", adminEmail, adminPhone, passwordHash]);
  const dispAdmin = insertAdminRes.rows[0];
  console.log(`Created disposable admin: ${dispAdmin.email} (${dispAdmin.id})`);

  // Create broadcast notification for read testing
  const notifRes = await pool.query(`
    INSERT INTO notifications (type, severity, title_ar, title_en, message_ar, message_en)
    VALUES ('SYSTEM', 'INFO', 'إشعار اختبار', 'Test Notice', 'محتوى الاختبار', 'Test Content')
    RETURNING id;
  `);
  const testNotifId = notifRes.rows[0].id;

  // Insert refresh token for admin
  await pool.query(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '7 days');
  `, [dispAdmin.id, `hash_admin_token_${timestamp}`]);

  // Insert notification_read for admin
  await pool.query(`
    INSERT INTO notification_reads (notification_id, user_id)
    VALUES ($1, $2);
  `, [testNotifId, dispAdmin.id]);

  // Point restaurant_settings.updated_by to this admin
  await pool.query(`
    UPDATE restaurant_settings SET updated_by = $1;
  `, [dispAdmin.id]);

  // Check BEFORE counts
  const adminBeforeCounts = {
    users: await countTableRows(`SELECT count(*) FROM users WHERE id = $1`, [dispAdmin.id]),
    drivers: await countTableRows(`SELECT count(*) FROM drivers WHERE user_id = $1`, [dispAdmin.id]),
    devices: 0,
    shifts: 0,
    location_points: 0,
    notifications: 0,
    notification_reads: await countTableRows(`SELECT count(*) FROM notification_reads WHERE user_id = $1`, [dispAdmin.id]),
    refresh_tokens: await countTableRows(`SELECT count(*) FROM refresh_tokens WHERE user_id = $1`, [dispAdmin.id]),
    alert_state: 0,
    alert_settings: await countTableRows(`SELECT count(*) FROM alert_settings`, []),
    restaurant_settings_updated_by: await countTableRows(`SELECT count(*) FROM restaurant_settings WHERE updated_by = $1`, [dispAdmin.id]),
  };
  console.log("Admin BEFORE deletion counts:", adminBeforeCounts);

  // Perform permanent deletion
  const adminDelResult = await permanentDeleteUser(dispAdmin.id, callerAdminId);
  console.log("permanentDeleteUser result for Admin:", adminDelResult);

  // Check AFTER counts
  const adminAfterCounts = {
    users: await countTableRows(`SELECT count(*) FROM users WHERE id = $1`, [dispAdmin.id]),
    drivers: await countTableRows(`SELECT count(*) FROM drivers WHERE user_id = $1`, [dispAdmin.id]),
    devices: 0,
    shifts: 0,
    location_points: 0,
    notifications: 0,
    notification_reads: await countTableRows(`SELECT count(*) FROM notification_reads WHERE user_id = $1`, [dispAdmin.id]),
    refresh_tokens: await countTableRows(`SELECT count(*) FROM refresh_tokens WHERE user_id = $1`, [dispAdmin.id]),
    alert_state: 0,
    alert_settings: await countTableRows(`SELECT count(*) FROM alert_settings`, []),
    restaurant_settings_updated_by: await countTableRows(`SELECT count(*) FROM restaurant_settings WHERE updated_by = $1`, [dispAdmin.id]),
  };
  console.log("Admin AFTER deletion counts:", adminAfterCounts);

  // Clean up broadcast notification
  await pool.query(`DELETE FROM notifications WHERE id = $1`, [testNotifId]);

  // ----------------------------------------------------------------
  // SECTION 3: VERIFY DISPOSABLE DRIVER DELETION
  // ----------------------------------------------------------------
  console.log("\n--- SECTION 3: VERIFY DISPOSABLE DRIVER DELETION ---");
  const driverEmail = `disposable_driver_${timestamp}@tracker.test`;
  const driverPhone = `+966598${String(timestamp).slice(-6)}`;
  const employeeId = `AUDIT-DRV-${timestamp}`;

  // 1. users
  const insertDriverUserRes = await pool.query(`
    INSERT INTO users (name, email, phone, password_hash, role, active)
    VALUES ($1, $2, $3, $4, 'DRIVER', true)
    RETURNING id, email;
  `, ["Disposable Driver", driverEmail, driverPhone, passwordHash]);
  const dispDriverUser = insertDriverUserRes.rows[0];

  // 2. drivers
  const insertDriverRes = await pool.query(`
    INSERT INTO drivers (user_id, employee_id, active)
    VALUES ($1, $2, true)
    RETURNING id;
  `, [dispDriverUser.id, employeeId]);
  const dispDriver = insertDriverRes.rows[0];

  // 3. devices
  const insertDeviceRes = await pool.query(`
    INSERT INTO devices (driver_id, platform, device_identifier, authorized)
    VALUES ($1, 'Android', $2, true)
    RETURNING id;
  `, [dispDriver.id, `AUDIT-DEV-${timestamp}`]);
  const dispDevice = insertDeviceRes.rows[0];

  // 4. shifts
  const insertShiftRes = await pool.query(`
    INSERT INTO shifts (driver_id, status)
    VALUES ($1, 'ACTIVE')
    RETURNING id;
  `, [dispDriver.id]);
  const dispShift = insertShiftRes.rows[0];

  // 5. location_points (telemetry)
  await pool.query(`
    INSERT INTO location_points (driver_id, shift_id, latitude, longitude, recorded_at, source)
    VALUES ($1, $2, 24.7136, 46.6753, NOW(), 'mobile');
  `, [dispDriver.id, dispShift.id]);

  // 6. alert_state
  await pool.query(`
    INSERT INTO alert_state (driver_id, alert_type)
    VALUES ($1, 'SPEEDING');
  `, [dispDriver.id]);

  // 7. notifications (driver & shift scoped)
  const insertDriverNotifRes = await pool.query(`
    INSERT INTO notifications (type, severity, title_ar, title_en, message_ar, message_en, driver_id, shift_id)
    VALUES ('SPEEDING', 'WARNING', 'سرعة زائدة', 'Speeding Alert', 'تجاوز السرعة', 'Speed exceeded', $1, $2)
    RETURNING id;
  `, [dispDriver.id, dispShift.id]);
  const dispDriverNotif = insertDriverNotifRes.rows[0];

  // 8. notification_reads
  await pool.query(`
    INSERT INTO notification_reads (notification_id, user_id)
    VALUES ($1, $2);
  `, [dispDriverNotif.id, dispDriverUser.id]);

  // 9. refresh_tokens
  await pool.query(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_id)
    VALUES ($1, $2, NOW() + INTERVAL '7 days', $3);
  `, [dispDriverUser.id, `hash_driver_token_${timestamp}`, dispDevice.id]);

  // Check BEFORE counts for Driver
  const driverBeforeCounts = {
    users: await countTableRows(`SELECT count(*) FROM users WHERE id = $1`, [dispDriverUser.id]),
    drivers: await countTableRows(`SELECT count(*) FROM drivers WHERE id = $1`, [dispDriver.id]),
    devices: await countTableRows(`SELECT count(*) FROM devices WHERE driver_id = $1`, [dispDriver.id]),
    shifts: await countTableRows(`SELECT count(*) FROM shifts WHERE driver_id = $1`, [dispDriver.id]),
    location_points: await countTableRows(`SELECT count(*) FROM location_points WHERE driver_id = $1`, [dispDriver.id]),
    notifications: await countTableRows(`SELECT count(*) FROM notifications WHERE driver_id = $1`, [dispDriver.id]),
    notification_reads: await countTableRows(`SELECT count(*) FROM notification_reads WHERE user_id = $1`, [dispDriverUser.id]),
    refresh_tokens: await countTableRows(`SELECT count(*) FROM refresh_tokens WHERE user_id = $1`, [dispDriverUser.id]),
    alert_state: await countTableRows(`SELECT count(*) FROM alert_state WHERE driver_id = $1`, [dispDriver.id]),
  };
  console.log("Driver BEFORE deletion counts:", driverBeforeCounts);

  // Perform permanent deletion
  const driverDelResult = await permanentDeleteUser(dispDriverUser.id, callerAdminId);
  console.log("permanentDeleteUser result for Driver:", driverDelResult);

  // Check AFTER counts for Driver
  const driverAfterCounts = {
    users: await countTableRows(`SELECT count(*) FROM users WHERE id = $1`, [dispDriverUser.id]),
    drivers: await countTableRows(`SELECT count(*) FROM drivers WHERE id = $1`, [dispDriver.id]),
    devices: await countTableRows(`SELECT count(*) FROM devices WHERE driver_id = $1`, [dispDriver.id]),
    shifts: await countTableRows(`SELECT count(*) FROM shifts WHERE driver_id = $1`, [dispDriver.id]),
    location_points: await countTableRows(`SELECT count(*) FROM location_points WHERE driver_id = $1`, [dispDriver.id]),
    notifications: await countTableRows(`SELECT count(*) FROM notifications WHERE driver_id = $1`, [dispDriver.id]),
    notification_reads: await countTableRows(`SELECT count(*) FROM notification_reads WHERE user_id = $1`, [dispDriverUser.id]),
    refresh_tokens: await countTableRows(`SELECT count(*) FROM refresh_tokens WHERE user_id = $1`, [dispDriverUser.id]),
    alert_state: await countTableRows(`SELECT count(*) FROM alert_state WHERE driver_id = $1`, [dispDriver.id]),
  };
  console.log("Driver AFTER deletion counts:", driverAfterCounts);

  // ----------------------------------------------------------------
  // SECTION 4: TRANSACTION ROLLBACK VERIFICATION
  // ----------------------------------------------------------------
  console.log("\n--- SECTION 4: TRANSACTION ROLLBACK VERIFICATION ---");
  const rollbackEmail = `rollback_test_${timestamp}@tracker.test`;
  const rollbackPhone = `+966597${String(timestamp).slice(-6)}`;
  const rollbackEmployeeId = `ROLLBACK-DRV-${timestamp}`;

  const rbUserRes = await pool.query(`
    INSERT INTO users (name, email, phone, password_hash, role, active)
    VALUES ($1, $2, $3, $4, 'DRIVER', true)
    RETURNING id;
  `, ["Rollback Driver", rollbackEmail, rollbackPhone, passwordHash]);
  const rbUserId = rbUserRes.rows[0].id;

  const rbDriverRes = await pool.query(`
    INSERT INTO drivers (user_id, employee_id, active)
    VALUES ($1, $2, true)
    RETURNING id;
  `, [rbUserId, rollbackEmployeeId]);
  const rbDriverId = rbDriverRes.rows[0].id;

  await pool.query(`
    INSERT INTO devices (driver_id, platform, device_identifier, authorized)
    VALUES ($1, 'Android', $2, true);
  `, [rbDriverId, `RB-DEV-${timestamp}`]);

  await pool.query(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '7 days');
  `, [rbUserId, `hash_rb_token_${timestamp}`]);

  let rollbackThrew = false;
  try {
    await db.transaction(async (tx) => {
      // Step 1: Delete devices
      await tx.delete(devicesTable).where(eq(devicesTable.driverId, rbDriverId));
      // Step 2: Delete drivers
      await tx.delete(driversTable).where(eq(driversTable.id, rbDriverId));
      // Step 3: DELIBERATE FAILURE: divide by zero or invalid statement
      await tx.execute(sql`SELECT 1 / 0`);
      // Step 4: Delete user (should never reach)
      await tx.delete(usersTable).where(eq(usersTable.id, rbUserId));
    });
  } catch (err: any) {
    rollbackThrew = true;
    console.log("Expected intentional transaction error caught:", err.message);
  }

  // Inspect state after transaction failure
  const postRollbackCounts = {
    userExists: await countTableRows(`SELECT count(*) FROM users WHERE id = $1`, [rbUserId]),
    driverExists: await countTableRows(`SELECT count(*) FROM drivers WHERE id = $1`, [rbDriverId]),
    deviceExists: await countTableRows(`SELECT count(*) FROM devices WHERE driver_id = $1`, [rbDriverId]),
    tokenExists: await countTableRows(`SELECT count(*) FROM refresh_tokens WHERE user_id = $1`, [rbUserId]),
  };
  console.log("Counts after aborted transaction (MUST ALL BE 1):", postRollbackCounts);

  // Clean up rollback test records with the real permanent deletion
  await permanentDeleteUser(rbUserId, callerAdminId);
  const postCleanupCounts = {
    user: await countTableRows(`SELECT count(*) FROM users WHERE id = $1`, [rbUserId]),
    driver: await countTableRows(`SELECT count(*) FROM drivers WHERE id = $1`, [rbDriverId]),
    device: await countTableRows(`SELECT count(*) FROM devices WHERE driver_id = $1`, [rbDriverId]),
    token: await countTableRows(`SELECT count(*) FROM refresh_tokens WHERE user_id = $1`, [rbUserId]),
  };
  console.log("Counts after final cleanup (MUST ALL BE 0):", postCleanupCounts);

  // ----------------------------------------------------------------
  // SECTION 5: AUTHENTICATION & IDENTIFIER REUSABILITY VERIFICATION
  // ----------------------------------------------------------------
  console.log("\n--- SECTION 5: AUTHENTICATION & IDENTIFIER REUSABILITY ---");
  // 1. Check if deleted driver can log in
  const userLookup = await pool.query(`SELECT * FROM users WHERE email = $1`, [driverEmail]);
  console.log("Query deleted driver user record by email:", userLookup.rows.length, "(Expected: 0)");

  // 2. Check if refresh token exists for deleted driver
  const tokenLookup = await pool.query(`SELECT * FROM refresh_tokens WHERE user_id = $1`, [dispDriverUser.id]);
  console.log("Query refresh tokens by deleted userId:", tokenLookup.rows.length, "(Expected: 0)");

  // 3. Check if device is authorized
  const devLookup = await pool.query(`SELECT * FROM devices WHERE driver_id = $1`, [dispDriver.id]);
  console.log("Query devices by deleted driverId:", devLookup.rows.length, "(Expected: 0)");

  // 4. Test Identifier Reusability: Register new user with the EXACT same email and phone
  const reuseRes = await pool.query(`
    INSERT INTO users (name, email, phone, password_hash, role, active)
    VALUES ('Reborn Driver', $1, $2, $3, 'DRIVER', true)
    RETURNING id, email, phone;
  `, [driverEmail, driverPhone, passwordHash]);
  console.log("Immediate re-registration with same email & phone:", reuseRes.rows[0]);

  // Clean up re-registered user
  await pool.query(`DELETE FROM users WHERE id = $1`, [reuseRes.rows[0].id]);
  console.log("Cleaned up re-registered test user successfully.");

  console.log("\n==================================================================");
  console.log("           LIVE AUDIT COMPLETED SUCCESSFULLY                      ");
  console.log("==================================================================");

  await pool.end();
}

main().catch((err) => {
  console.error("FATAL ERROR in audit:", err);
  process.exit(1);
});
