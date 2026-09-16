import { pool } from "@workspace/db";

async function remediateManager() {
  const client = await pool.connect();
  console.log("=== REMEDIATING LEGACY MANAGER USER ===");

  try {
    await client.query("BEGIN;");

    // 1. Inspect target row before update
    const preCheck = await client.query(`
      SELECT id, email, role, created_at
      FROM users
      WHERE role = 'MANAGER';
    `);

    console.log(`Pre-migration MANAGER count: ${preCheck.rows.length}`);
    console.table(preCheck.rows);

    if (preCheck.rows.length === 0) {
      console.log("No legacy MANAGER users found. Migration is idempotent and already applied.");
      await client.query("COMMIT;");
      return;
    }

    if (preCheck.rows.length !== 1 || preCheck.rows[0].email !== "manager.integration@tracker.local") {
      throw new Error(`Safety halt: Unexpected MANAGER rows found: ${JSON.stringify(preCheck.rows)}`);
    }

    const targetId = preCheck.rows[0].id;

    // 2. Perform strictly targeted update
    const updateResult = await client.query(`
      UPDATE users
      SET role = 'CALL_CENTER', updated_at = NOW()
      WHERE role = 'MANAGER' AND id = $1
      RETURNING id, email, role, updated_at;
    `, [targetId]);

    console.log(`Rows updated: ${updateResult.rowCount}`);
    console.table(updateResult.rows);

    // 3. Verify post-condition
    const postCheck = await client.query(`
      SELECT id, email, role, created_at
      FROM users
      WHERE role = 'MANAGER';
    `);

    if (postCheck.rows.length !== 0) {
      throw new Error(`Verification failed: ${postCheck.rows.length} MANAGER rows still remain.`);
    }

    // 4. Verify distribution across all roles
    const distribution = await client.query(`
      SELECT role, COUNT(*)::int as count
      FROM users
      GROUP BY role
      ORDER BY role;
    `);

    console.log("\nPost-migration Role Distribution:");
    console.table(distribution.rows);

    await client.query("COMMIT;");
    console.log("Transaction COMMITTED successfully.");
  } catch (error) {
    await client.query("ROLLBACK;");
    console.error("Migration failed and rolled back:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

remediateManager().catch(console.error);

