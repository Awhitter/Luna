import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Ensure required Postgres extensions exist. Safe to run repeatedly — it's a
// no-op if already enabled. Required for pgvector-backed agent_memories.
let extensionsReadyPromise: Promise<void> | null = null;
export function ensureExtensions(): Promise<void> {
  if (!extensionsReadyPromise) {
    extensionsReadyPromise = pool
      .query("CREATE EXTENSION IF NOT EXISTS vector")
      .then(() => undefined)
      .catch((err) => {
        extensionsReadyPromise = null;
        throw err;
      });
  }
  return extensionsReadyPromise;
}

export * from "./schema";
