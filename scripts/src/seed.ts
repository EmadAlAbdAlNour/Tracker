import fs from "node:fs";
import path from "node:path";
import { config as loadDotEnv } from "dotenv";
import bcrypt from "bcryptjs";
import { db, driversTable, usersTable } from "@workspace/db";

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

type SeedUser = {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: "ADMIN" | "DRIVER";
};

const seedPassword = process.env.TRACKER_SEED_PASSWORD;
if (!seedPassword) {
  throw new Error("TRACKER_SEED_PASSWORD is required before seeding tracker data");
}

const seedUsers: SeedUser[] = [
  { name: "Admin User", email: "admin@tracker.local", phone: "+966500000001", password: seedPassword, role: "ADMIN" },
  ...Array.from({ length: 10 }, (_, index) => ({
    name: `Driver ${index + 1}`,
    email: `driver${index + 1}@tracker.local`,
    phone: `+9665000000${String(index + 10).padStart(2, "0")}`,
    password: seedPassword,
    role: "DRIVER" as const,
  })),
];

async function seed(): Promise<void> {
  const existing = await db.select().from(usersTable).limit(1);
  if (existing.length > 0) {
    console.info("Seed data already exists. Skipping.");
    return;
  }

  for (const [index, user] of seedUsers.entries()) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    const insertedUser = await db.insert(usersTable).values({
      name: user.name,
      email: user.email,
      phone: user.phone,
      passwordHash,
      role: user.role,
      active: true,
    }).returning();

    if (user.role === "DRIVER") {
      await db.insert(driversTable).values({
        userId: insertedUser[0].id,
        employeeId: `EMP-${String(index + 1).padStart(4, "0")}`,
        active: true,
      });
    }
  }

  console.info("Development seed complete.");
}

seed().catch((error) => {
  console.error("Seed failed", error);
  process.exitCode = 1;
});
