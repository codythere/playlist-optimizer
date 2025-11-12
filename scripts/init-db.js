// scripts/init-db.js
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

(async () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "db", "schema.pg.sql"),
    "utf8"
  );
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });
  try {
    await pool.query(sql);
    console.log("✅ Schema applied");
  } catch (e) {
    console.error("❌ Failed:", e);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
