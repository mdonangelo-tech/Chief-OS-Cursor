import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
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

// Prisma validates env("DIRECT_URL") at build time if present in schema.
// Default it to DATABASE_URL so deploys don't fail if DIRECT_URL isn't set.
if (!process.env.DIRECT_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

if (isVercel) {
  run(prismaBin(), prismaArgs(["migrate", "deploy"]));
}

run(prismaBin(), prismaArgs(["generate"]));
run("npx", ["next", "build"]);

