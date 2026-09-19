import { pool } from "@workspace/db";

async function main() {
  await pool.query("UPDATE restaurant_settings SET radius_meters = 500");
  const r = await pool.query("SELECT id, name, radius_meters FROM restaurant_settings");
  console.log("UPDATED_RESTAURANT_SETTINGS:", r.rows);
  await pool.end();
}

main().catch(console.error);

