import fs from "node:fs";
import path from "node:path";
import { config as loadDotEnv } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

function loadRootEnv(): void {
  let currentDir = process.cwd();

  while (true) {
    const envPath = path.join(currentDir, ".env");
    if (fs.existsSync(envPath)) {
      loadDotEnv({ path: envPath, override: false });
      return;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return;
    }
    currentDir = parentDir;
  }
}

loadRootEnv();

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a PostgreSQL database?",
  );
}

function normalizeDatabaseUrl(rawUrl: string): string {
  if (rawUrl.includes("sslmode=require") && !rawUrl.includes("uselibpqcompat")) {
    const separator = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${separator}uselibpqcompat=true`;
  }
  return rawUrl;
}

const normalizedDatabaseUrl = normalizeDatabaseUrl(databaseUrl);

export const pool = new Pool({
  connectionString: normalizedDatabaseUrl,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await pool.query("SELECT 1 as ok");
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}

export { databaseUrl };
export * from "./schema";
