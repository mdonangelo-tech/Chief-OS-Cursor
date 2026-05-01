import { test } from "node:test";
import assert from "node:assert/strict";
import { asDbErrorInfo, isDbUnreachableError } from "@/lib/db-errors";

test("isDbUnreachableError detects common Prisma/Neon unreachable messages", () => {
  assert.equal(
    isDbUnreachableError(
      new Error(
        "Invalid `prisma.googleAccount.findMany()` invocation: Can't reach database server at `ep-example:5432` (P1001)"
      )
    ),
    true
  );
  assert.equal(isDbUnreachableError(new Error("P1001: Can't reach database server")), true);
  assert.equal(isDbUnreachableError(new Error("Some other error")), false);
});

test("asDbErrorInfo returns structured info for unreachable DB", () => {
  const info = asDbErrorInfo(new Error("P1001: Can't reach database server"));
  assert.ok(info);
  assert.equal(info.code, "DB_UNREACHABLE");
  assert.ok(info.message.toLowerCase().includes("database"));
});

