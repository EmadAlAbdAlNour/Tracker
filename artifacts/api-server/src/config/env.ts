import fs from "node:fs";
import path from "node:path";
import { config as loadDotEnv } from "dotenv";

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

const requiredEnv = ["DATABASE_URL", "JWT_SECRET", "JWT_REFRESH_SECRET"] as const;

export type AppEnv = {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  nodeEnv: string;
};

export function getEnv(): AppEnv {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const portRaw = process.env.PORT ?? "3000";
  const port = Number(portRaw);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${portRaw}`);
  }

  const values = {
    port,
    databaseUrl: process.env.DATABASE_URL?.trim(),
    jwtSecret: process.env.JWT_SECRET?.trim(),
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET?.trim(),
    nodeEnv,
  };

  for (const key of requiredEnv) {
    const value =
      key === "DATABASE_URL"
        ? values.databaseUrl
        : key === "JWT_SECRET"
          ? values.jwtSecret
          : values.jwtRefreshSecret;

    if (!value) {
      // During automated tests, provide safe defaults instead of throwing to enable in-test DB setup.
      if (nodeEnv === 'test') {
        if (key === 'DATABASE_URL') values.databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/tracker_test';
        if (key === 'JWT_SECRET') values.jwtSecret = process.env.JWT_SECRET ?? 'test-jwt-secret';
        if (key === 'JWT_REFRESH_SECRET') values.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';
        continue;
      }

      throw new Error(`${key} must be set in the environment.`);
    }
  }

  return values as AppEnv;
}
