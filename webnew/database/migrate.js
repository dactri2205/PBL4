import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../backend/src/db/pool.js";

const migrationsDir = resolve(process.env.MIGRATIONS_DIR || fileURLToPath(new URL("./migrations/", import.meta.url)));
const legacyBaseline = ["010_schema.sql", "020_demo_data.sql"];
const requiredLegacyTables = [
  "departments",
  "users",
  "directory_profiles",
  "projects",
  "project_members",
  "tasks",
  "task_assignees",
  "announcements",
  "notifications",
];
const advisoryLockId = 728_410_26;

function checksum(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function listMigrationFiles() {
  const { readdir } = await import("node:fs/promises");
  const names = (await readdir(migrationsDir))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en"));

  if (names.length === 0) throw new Error("No SQL migrations found.");
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(resolve(migrationsDir, name), "utf8");
      return { name, sql, checksum: checksum(sql) };
    }),
  );
}

async function hasLegacyBootstrap(client) {
  const result = await client.query(
    "SELECT name, to_regclass('public.' || name) IS NOT NULL AS present FROM unnest($1::text[]) AS t(name)",
    [requiredLegacyTables],
  );
  return result.rows.every((row) => row.present);
}

async function baselineLegacyDatabase(client, migrations) {
  const files = new Map(migrations.map((migration) => [migration.name, migration]));
  if (!legacyBaseline.every((name) => files.has(name)))
    throw new Error("Legacy database found, but expected baseline migrations are missing.");

  const isLegacy = await hasLegacyBootstrap(client);
  const tablesResult = await client.query(
    "SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
  );
  const tableCount = tablesResult.rows[0].count;

  if (isLegacy) {
    for (const name of legacyBaseline) {
      const migration = files.get(name);
      await client.query(
        "INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
        [migration.name, migration.checksum],
      );
    }
    console.log("Adopted existing An Việt bootstrap schema as migration baseline.");
    return;
  }

  if (tableCount > 0)
    throw new Error(
      "Database has tables but does not match the known An Việt baseline; refusing to apply migrations automatically.",
    );
}

async function runMigrations() {
  const migrations = await listMigrationFiles();
  const client = await pool.connect();
  let locked = false;

  try {
    await client.query("SELECT pg_advisory_lock($1)", [advisoryLockId]);
    locked = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version TEXT PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const initial = await client.query(
      "SELECT count(*)::int AS count FROM public.schema_migrations",
    );
    if (initial.rows[0].count === 0)
      await baselineLegacyDatabase(client, migrations);

    const appliedResult = await client.query(
      "SELECT version, checksum FROM public.schema_migrations",
    );
    const applied = new Map(
      appliedResult.rows.map((row) => [row.version, row.checksum.trim()]),
    );

    for (const migration of migrations) {
      const previousChecksum = applied.get(migration.name);
      if (previousChecksum) {
        if (previousChecksum !== migration.checksum)
          throw new Error(
            `Applied migration ${migration.name} has changed; add a new migration instead.`,
          );
        continue;
      }

      console.log(`Applying ${migration.name}`);
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)",
          [migration.name, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    await client.query(
      "REVOKE ALL ON TABLE public.schema_migrations FROM anviet_app",
    );
    console.log("Database migrations are up to date.");
  } finally {
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [advisoryLockId]);
      } catch {}
    }
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error("Database migration failed:", error.message);
  process.exitCode = 1;
});
