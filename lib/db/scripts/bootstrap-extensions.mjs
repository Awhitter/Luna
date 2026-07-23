import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  console.log("ok: pgvector extension is enabled");
} catch (err) {
  console.error("Failed to enable pgvector extension:", err);
  process.exit(1);
} finally {
  await pool.end();
}
