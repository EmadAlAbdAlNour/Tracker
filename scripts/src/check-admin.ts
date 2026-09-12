import { db, usersTable } from "@workspace/db";

const users = await db
  .select({
    email: usersTable.email,
    role: usersTable.role,
    active: usersTable.active,
    passwordHash: usersTable.passwordHash,
  })
  .from(usersTable);

for (const u of users) {
  console.log({
    email: u.email,
    role: u.role,
    active: u.active,
    hashLength: u.passwordHash?.length,
    hashPrefix: u.passwordHash?.slice(0, 4),
  });
}
