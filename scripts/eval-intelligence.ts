import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { selectTopPriorities, type PriorityEmailInput } from "../src/services/brief/intelligence";
import { classifyEmailWithLlm } from "../src/services/llm";

type PriorityFixture = {
  type: "brief_priority";
  name: string;
  maxPriorities: number;
  excludePriorityCategories: string[];
  boostCategories: string[];
  emails: PriorityEmailInput[];
  expectedTopIds: string[];
  expectedNotInTopIds?: string[];
  llmSamples?: Array<{ from: string; subject: string | null; snippet: string | null }>;
};

function asArray<T>(v: T[] | undefined | null): T[] {
  return Array.isArray(v) ? v : [];
}

function fmtDiff(expected: string[], actual: string[]): string {
  const exp = new Set(expected);
  const act = new Set(actual);
  const missing = expected.filter((x) => !act.has(x));
  const extra = actual.filter((x) => !exp.has(x));
  const parts: string[] = [];
  if (missing.length) parts.push(`missing=[${missing.join(", ")}]`);
  if (extra.length) parts.push(`extra=[${extra.join(", ")}]`);
  return parts.join(" ");
}

function runPriorityFixture(fx: PriorityFixture): { pass: boolean; details: string } {
  const got = selectTopPriorities(fx.emails, {
    excludePriorityCategories: fx.excludePriorityCategories,
    boostCategories: fx.boostCategories,
    maxPriorities: fx.maxPriorities,
  });

  const gotIds = got.map((g) => g.id);
  const wantIds = fx.expectedTopIds;

  let pass = gotIds.join("|") === wantIds.join("|");

  const expectedNotIn = asArray(fx.expectedNotInTopIds);
  if (expectedNotIn.length) {
    const gotSet = new Set(gotIds);
    const leaked = expectedNotIn.filter((id) => gotSet.has(id));
    if (leaked.length) pass = false;
  }

  const details =
    pass
      ? `top=[${gotIds.join(", ")}]`
      : `want=[${wantIds.join(", ")}] got=[${gotIds.join(", ")}] ${fmtDiff(wantIds, gotIds)}`;

  return { pass, details };
}

async function maybeRunLlmSamples(fixtures: PriorityFixture[], enabled: boolean) {
  if (!enabled) return;
  const samples = fixtures.flatMap((f) => asArray(f.llmSamples));
  if (samples.length === 0) return;

  // Non-deterministic: print outputs only; never used for pass/fail.
  // This is meant for local sanity checks against the current classifier implementation.
  // (CI should not run this mode.)
  // eslint-disable-next-line no-console
  console.log(`\nLLM samples (${samples.length})`);
  for (const s of samples) {
    const out = await classifyEmailWithLlm(s.from, s.subject, s.snippet, null, []);
    // eslint-disable-next-line no-console
    console.log({
      from: s.from,
      subject: s.subject,
      out,
    });
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const llm = args.has("--llm");

  const fixturesDir = path.join(process.cwd(), "scripts", "eval", "fixtures");
  const files = (await readdir(fixturesDir)).filter((f) => f.endsWith(".json"));

  const fixtures: PriorityFixture[] = [];
  for (const f of files) {
    const raw = await readFile(path.join(fixturesDir, f), "utf8");
    const parsed = JSON.parse(raw) as { type?: string };
    if (parsed?.type === "brief_priority") fixtures.push(parsed as PriorityFixture);
  }

  let passed = 0;
  let failed = 0;

  for (const fx of fixtures) {
    const r = runPriorityFixture(fx);
    if (r.pass) passed++;
    else failed++;
    // eslint-disable-next-line no-console
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${fx.name}  ${r.details}`);
  }

  await maybeRunLlmSamples(fixtures, llm);

  // eslint-disable-next-line no-console
  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

