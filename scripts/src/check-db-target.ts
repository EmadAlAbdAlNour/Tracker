import path from "node:path";
import fs from "node:fs";
import { config } from "dotenv";

let dir = process.cwd();

while (true) {
  const envPath = path.join(dir, ".env");
  if (fs.existsSync(envPath)) {
    config({ path: envPath });
    break;
  }

  const parent = path.dirname(dir);
  if (parent === dir) break;
  dir = parent;
}

const u = process.env.DATABASE_URL ?? "";

try {
  const x = new URL(u);
  console.log("HOST:", x.hostname);
  console.log("DATABASE:", x.pathname.slice(1));
} catch {
  console.log("DATABASE_URL_NOT_LOADED");
}
