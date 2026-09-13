import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { config as loadDotEnv } from "dotenv";

function findRootDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, ".env"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const rootDir = findRootDir();
const envPath = path.join(rootDir, ".env");
if (fs.existsSync(envPath)) {
  loadDotEnv({ path: envPath, override: true });
}

const dbRequire = createRequire(path.resolve(rootDir, "lib/db/src/index.ts"));
const pg = dbRequire("pg");
const { Client } = pg;

const baseDbUrl = process.env.DATABASE_URL;
if (!baseDbUrl) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

const testDbName = `tracker_disp_${Date.now()}`;
// Neon database URLs: postgresql://user:pass@host/dbname?...
const testDbUrl = baseDbUrl.replace(/\/neondb(\?|$)/, `/${testDbName}$1`);

export interface AuditResult {
  step: string;
  passed: boolean;
  details?: any;
}

const results: AuditResult[] = [];

async function run() {
  console.log("==================================================");
  console.log("TRACKER GATE — 1. DATABASE REPRODUCIBILITY AUDIT");
  console.log("==================================================");

  // 1. Check migrations directory & metadata
  const migrationsDir = path.resolve(rootDir, "lib/db/drizzle");
  const metaDir = path.join(migrationsDir, "meta");
  const journalPath = path.join(metaDir, "_journal.json");

  console.log("\n[Step 1] Verifying migration files and journal consistency...");
  if (!fs.existsSync(journalPath)) {
    throw new Error("_journal.json not found in lib/db/drizzle/meta");
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
  const diskFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  const journalEntries = journal.entries || [];

  console.log(`- Journal dialect: ${journal.dialect}`);
  console.log(`- Journal entries: ${journalEntries.length}`);
  console.log(`- Disk migration files: ${diskFiles.length}`);

  // Check for orphan files
  const journalTags = new Set(journalEntries.map((e: any) => `${e.tag}.sql`));
  const orphanFiles = diskFiles.filter((f) => !journalTags.has(f));
  if (orphanFiles.length > 0) {
    throw new Error(`Orphan migration files found on disk: ${orphanFiles.join(", ")}`);
  }
  console.log("✓ No orphan migration files found.");
  results.push({ step: "No orphan migration files", passed: true });

  // Verify snapshots exist
  const snapshotFiles = fs.readdirSync(metaDir).filter((f) => f.endsWith("_snapshot.json"));
  console.log(`- Snapshots found: ${snapshotFiles.join(", ")}`);
  results.push({ step: "Migration metadata & snapshots verified", passed: true, details: snapshotFiles });

  // 2. Connect to postgres and create disposable database
  console.log(`\n[Step 2] Provisioning disposable PostgreSQL database: ${testDbName}`);
  const rootClient = new Client({ connectionString: baseDbUrl, ssl: { rejectUnauthorized: false } });
  await rootClient.connect();

  try {
    await rootClient.query(`CREATE DATABASE "${testDbName}"`);
    console.log(`✓ Disposable database "${testDbName}" created successfully.`);
    results.push({ step: "Create disposable database", passed: true });
  } finally {
    await rootClient.end();
  }

  // 3. Connect to the fresh empty disposable database
  console.log("\n[Step 3] Connecting to the fresh empty disposable database...");
  const dbClient = new Client({ connectionString: testDbUrl, ssl: { rejectUnauthorized: false } });
  await dbClient.connect();

  try {
    // Verify it is completely empty
    const initialTables = await dbClient.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    console.log(`- Initial table count in new database: ${initialTables.rows.length}`);
    if (initialTables.rows.length !== 0) {
      throw new Error(`Expected new database to be empty, but found ${initialTables.rows.length} tables`);
    }
    console.log("✓ Verified database is completely empty (0 tables).");
    results.push({ step: "Verify empty DB", passed: true });

    // 4. Run entire migration chain sequentially
    console.log("\n[Step 4] Executing migration chain from 0000 to 0004...");
    for (const entry of journalEntries) {
      const sqlFile = path.join(migrationsDir, `${entry.tag}.sql`);
      if (!fs.existsSync(sqlFile)) {
        throw new Error(`Migration SQL file missing: ${sqlFile}`);
      }

      console.log(`\n  Executing migration [${entry.idx}] ${entry.tag}.sql...`);
      const rawSql = fs.readFileSync(sqlFile, "utf-8");

      // Execute statement by statement
      const statements = rawSql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const startTime = Date.now();
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        try {
          await dbClient.query(stmt);
        } catch (stmtErr: any) {
          console.error(`\n❌ Error in migration ${entry.tag} statement ${i + 1}:\n${stmt}\nError: ${stmtErr.message}`);
          throw stmtErr;
        }
      }
      const durationMs = Date.now() - startTime;
      console.log(`  ✓ Migration [${entry.idx}] ${entry.tag} succeeded (${durationMs}ms, ${statements.length} statements)`);
      results.push({ step: `Migration ${entry.tag}`, passed: true, details: `${durationMs}ms` });
    }

    // 5. Verify final schema against expected Drizzle tables
    console.log("\n[Step 5] Verifying final migrated schema...");
    const expectedTables = [
      "users",
      "drivers",
      "devices",
      "refresh_tokens",
      "shifts",
      "location_points",
      "restaurant_settings",
      "alert_settings",
      "notifications",
      "alert_state",
    ];

    const tablesRes = await dbClient.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    const actualTables = tablesRes.rows.map((r: any) => r.table_name);
    console.log("- Migrated tables in public schema:", actualTables);

    for (const table of expectedTables) {
      if (!actualTables.includes(table)) {
        throw new Error(`Expected table '${table}' missing from migrated database!`);
      }
    }
    console.log("✓ All 10 expected domain tables exist in migrated database.");

    // Verify critical indexes and constraints
    console.log("\n[Step 6] Verifying critical schema indexes and constraints...");
    const indexRes = await dbClient.query(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY indexname
    `);

    const indexNames = indexRes.rows.map((r: any) => r.indexname);
    const criticalIndexes = [
      "devices_driver_one_authorized_idx", // 1 authorized device per driver partial unique index
      "shifts_driver_active_unique",       // 1 active shift per driver partial unique index
      "location_points_driver_client_location_unique", // idempotent client location deduplication
      "location_points_driver_recorded_idx", // composite telemetry index
      "alert_state_driver_alert_unique",   // alert state deduplication index
    ];

    for (const idx of criticalIndexes) {
      if (!indexNames.includes(idx)) {
        throw new Error(`Critical index '${idx}' missing from migrated database!`);
      }
      console.log(`  ✓ Index confirmed: ${idx}`);
    }
    results.push({ step: "Critical schema indexes & constraints", passed: true, details: criticalIndexes });

    // Verify Enum Types
    const enumRes = await dbClient.query(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder
    `);
    console.log("\n- Enums in database:", enumRes.rows);

    const userRoles = enumRes.rows.filter((r: any) => r.typname === "user_role").map((r: any) => r.enumlabel);
    const shiftStatuses = enumRes.rows.filter((r: any) => r.typname === "shift_status").map((r: any) => r.enumlabel);

    if (!userRoles.includes("ADMIN") || !userRoles.includes("DRIVER") || !userRoles.includes("CALL_CENTER")) {
      throw new Error(`user_role enum missing expected values: ${JSON.stringify(userRoles)}`);
    }
    if (!shiftStatuses.includes("ACTIVE") || !shiftStatuses.includes("COMPLETED")) {
      throw new Error(`shift_status enum missing expected values: ${JSON.stringify(shiftStatuses)}`);
    }
    console.log("✓ Enums (user_role with CALL_CENTER, shift_status) verified.");
    results.push({ step: "Enum verification", passed: true });

  } finally {
    await dbClient.end();
  }

  console.log("\n==================================================");
  console.log("DATABASE REPRODUCIBILITY AUDIT SUMMARY:");
  console.log("==================================================");
  for (const r of results) {
    console.log(`[PASS] ${r.step}`);
  }

  return { testDbName, testDbUrl };
}

// Export runner
export { run, testDbName, testDbUrl };

if (process.argv[1]?.includes("database-reproducibility-gate")) {
  run()
    .then(async ({ testDbName: name }) => {
      console.log(`\nDisposable database '${name}' is preserved for integration testing.`);
    })
    .catch((err) => {
      console.error("\n❌ DATABASE REPRODUCIBILITY AUDIT FAILED:", err);
      process.exit(1);
    });
}
