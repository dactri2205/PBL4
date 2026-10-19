import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
}
walk("frontend");
const failures = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (file.endsWith(".js")) {
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    } catch (e) {
      failures.push(`${file}: ${e.stderr}`);
    }
  }
  if (!/\.(html|css|js)$/.test(file) || file.includes("vendor")) continue;
  const refs = file.endsWith(".html")
    ? [...text.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)].map(
        (m) => m[1],
      )
    : file.endsWith(".css")
      ? [...text.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)].map((m) => m[1])
      : [...text.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)].map(
          (m) => m[1],
        );
  for (const ref of refs) {
    if (/^(https?:|data:|#)/.test(ref)) continue;
    if (!existsSync(resolve(dirname(file), ref)))
      failures.push(`${file}: missing ${ref}`);
  }
  if (/https?:\/\//.test(text) && !file.endsWith(".svg")) {
    const remoteRuntime =
      /(?:src|href)="https?:|url\(['"]?https?:|fetch\(['"]https?:/.test(text);
    if (remoteRuntime) failures.push(`${file}: remote runtime dependency`);
  }
}
for (const page of ["index", "login", "news", "department", "work", "admin"])
  if (!existsSync(`frontend/${page}.html`))
    failures.push(`Missing page ${page}`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `PASS: ${files.length} frontend files checked; JS syntax, local references, six pages and no remote runtime dependencies.`,
  );
