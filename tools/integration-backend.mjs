// Disposable PostgreSQL integration fixture, started only by the .NET test harness.
// Secrets arrive over stdin, never command-line arguments or files. This is not shipped
// in the backend Docker image and must never target a business database.
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
if (process.env.MINIVPN_INTEGRATION_FIXTURE !== "1") throw Error("Integration fixture flag required.");
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const iterator = input[Symbol.asyncIterator]();
const config = JSON.parse((await iterator.next()).value);
if (!/^pbl4_test_[a-f0-9]+$/.test(config.database)) throw Error("Disposable database name required.");
Object.assign(process.env, { PGHOST: "127.0.0.1", PGPORT: String(config.port), PGDATABASE: config.database,
  PGUSER: "postgres", PGPASSWORD: config.password, COOKIE_SECURE: "true", PORT: "0", HOST: "127.0.0.1" });
const { default: pg } = await import("../backend/node_modules/pg/lib/index.js");
const admin = new pg.Client(); await admin.connect();
if (!/^[a-f0-9]{64}$/.test(config.password)) throw Error("Fixture secret must be random hex.");
await admin.query(`CREATE ROLE anviet_app LOGIN PASSWORD '${config.password}'`);
await admin.end();
async function migrate() {
  const child = spawn(process.execPath, [resolve("database/migrate.js")], { cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, PGUSER: "postgres" }, stdio: ["ignore", "pipe", "pipe"] });
  let failure = ""; child.stdout.resume(); child.stderr.on("data", data => failure += data);
  const [code] = await once(child, "exit");
  if (code !== 0) throw Error("Fixture migration failed: " + failure);
}
await migrate(); await migrate();
process.env.PGUSER = "anviet_app";
const { pool } = await import("../backend/src/db/pool.js");
const { setUserPassword } = await import("../backend/src/repositories/account-repository.js");
const { createAdminUser } = await import("../backend/src/repositories/admin-user-repository.js");
const { authenticateUser } = await import("../backend/src/auth/auth-service.js");
const { createSession } = await import("../backend/src/auth/session-store.js");
await setUserPassword("hoangan", config.adminPassword);
await setUserPassword("quangminh", config.employeePassword);
const second = await createAdminUser({ id: "admin" }, { name: "Integration Admin", username: "integration_admin", role: "ADMIN", departmentId: "it" });
await setUserPassword("integration_admin", config.adminPassword);
const { server } = await import("../backend/src/server.js");
if (!server.listening) await once(server, "listening");
console.log(JSON.stringify({ event: "ready", port: server.address().port, secondId: second.id }));
for await (const line of { [Symbol.asyncIterator]: () => iterator }) {
  const command = JSON.parse(line);
  try {
    let result = true;
    if (command.action === "expire") await pool.query("UPDATE auth_sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1", [command.userId]);
    else if (command.action === "reset") await setUserPassword(command.username, config.adminPassword);
    else if (command.action === "race") {
      const stale = await authenticateUser("quangminh", config.employeePassword);
      await setUserPassword("quangminh", config.employeePassword);
      result = (await createSession(stale.id, stale.authVersion)) === null;
    } else if (command.action === "stop") {
      await new Promise(resolveClose => server.close(resolveClose)); await pool.end();
      process.stdout.write(JSON.stringify({ id: command.id, result: true }) + "\n", () => process.exit(0));
      input.close(); process.stdin.pause(); break;
    } else throw Error("Unknown fixture command");
    console.log(JSON.stringify({ id: command.id, result }));
  } catch (error) { console.log(JSON.stringify({ id: command.id, error: error.code || "fixture-command-failed" })); }
}
