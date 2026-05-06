import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    shell: false,
    ...opts,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function prismaBin() {
  // Use local prisma binary when available; fallback to npx.
  return process.platform === "win32" ? "npx" : "npx";
}

function prismaArgs(subcommandArgs) {
  // If using npx, include prisma as first arg.
  return ["prisma", ...subcommandArgs];
}

const isVercel = process.env.VERCEL === "1";

function deriveDirectUrlFromDatabaseUrl(databaseUrl) {
  if (!databaseUrl) return null;
  let u;
  try {
    u = new URL(databaseUrl);
  } catch {
    return null;
  }

  // Neon pooler hosts typically include "-pooler". Migrations/advisory locks are more reliable
  // on the direct (non-pooler) host.
  if (u.hostname.includes("-pooler.")) {
    u.hostname = u.hostname.replace("-pooler.", ".");
  }

  // Remove common pooler-only params.
  const paramsToRemove = ["pgbouncer", "connection_limit", "pool_timeout"];
  for (const k of paramsToRemove) u.searchParams.delete(k);

  return u.toString();
}

// Prisma validates env("DIRECT_URL") at build time if present in schema.
// On Vercel, we also use DIRECT_URL for migrate deploy so we avoid pooler-related issues.
if (!process.env.DIRECT_URL) {
  process.env.DIRECT_URL =
    deriveDirectUrlFromDatabaseUrl(process.env.DATABASE_URL) ?? process.env.DATABASE_URL;
}

if (isVercel) {
  // Vercel can trigger overlapping deployments; Prisma uses advisory locks for migrations and
  // can time out. Retry a few times with backoff rather than failing the whole build.
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = spawnSync(prismaBin(), prismaArgs(["migrate", "deploy"]), {
      shell: false,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = r.stdout ?? "";
    const stderr = r.stderr ?? "";
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);

    if (r.status === 0) break;

    const combined = `${stdout}\n${stderr}`.toLowerCase();
    const isAdvisoryLockTimeout =
      combined.includes("pg_advisory_lock") ||
      combined.includes("migrate-advisory-locking") ||
      combined.includes("p1002");

    if (!isAdvisoryLockTimeout || attempt === maxAttempts) {
      process.exit(r.status ?? 1);
    }

    const backoffMs = 1500 * attempt * attempt;
    console.warn(
      `[build] prisma migrate deploy retry ${attempt}/${maxAttempts} in ${backoffMs}ms (advisory lock timeout)`
    );
    // eslint-disable-next-line no-await-in-loop
    await sleep(backoffMs);
  }
}

run(prismaBin(), prismaArgs(["generate"]));
run("npx", ["next", "build"]);

