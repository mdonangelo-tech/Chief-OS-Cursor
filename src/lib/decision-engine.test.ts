import assert from "node:assert/strict";
import test from "node:test";
import { decideEmail } from "./decision-engine";

function makeCtx(overrides?: Partial<Parameters<typeof decideEmail>[1]>): Parameters<typeof decideEmail>[1] {
  return {
    personRules: [],
    orgRules: [],
    categoriesById: {},
    categoryPoliciesById: {},
    now: new Date("2026-02-11T12:00:00.000Z"),
    llmEnabled: true,
    ...overrides,
  };
}

function makeEmailEvent(
  overrides?: Partial<Parameters<typeof decideEmail>[0]>
): Parameters<typeof decideEmail>[0] {
  return {
    id: "evt_1",
    googleAccountId: "ga_1",
    date: new Date("2026-02-11T00:00:00.000Z"),
    from_: "Sender <sender@example.com>",
    senderDomain: "example.com",
    classificationCategoryId: null,
    confidence: null,
    explainJson: null,
    ...overrides,
  };
}

test("Person rule overrides domain rule", () => {
  const categoriesById = {
    cat_person: { id: "cat_person", name: "Personal", protectedFromAutoArchive: false },
    cat_domain: { id: "cat_domain", name: "Work", protectedFromAutoArchive: false },
  };

  const res = decideEmail(
    makeEmailEvent({ from_: "Sender <sender@example.com>", senderDomain: "example.com" }),
    makeCtx({
      categoriesById,
      personRules: [{ email: "sender@example.com", categoryId: "cat_person" }],
      orgRules: [{ domain: "example.com", categoryId: "cat_domain" }],
      categoryPoliciesById: {
        cat_person: { action: "label_only" },
        cat_domain: { action: "label_only" },
      },
    })
  );

  assert.equal(res.reason.winner, "personRule");
  assert.equal(res.finalCategoryId, "cat_person");
  assert.ok(res.reason.overrides.some((o) => o.overriddenSource === "domainRule"));
});

test("Domain rule overrides LLM", () => {
  const categoriesById = {
    cat_domain: { id: "cat_domain", name: "Work", protectedFromAutoArchive: false },
    cat_llm: { id: "cat_llm", name: "Newsletters", protectedFromAutoArchive: false },
  };

  const res = decideEmail(
    makeEmailEvent({
      from_: "Sender <sender@example.com>",
      senderDomain: "example.com",
      classificationCategoryId: "cat_llm",
      confidence: 0.9,
      explainJson: { source: "llm", reason: "Model said so" },
    }),
    makeCtx({
      categoriesById,
      orgRules: [{ domain: "example.com", categoryId: "cat_domain" }],
      categoryPoliciesById: {
        cat_domain: { action: "label_only" },
        cat_llm: { action: "label_only" },
      },
      llmEnabled: true,
    })
  );

  assert.equal(res.reason.winner, "domainRule");
  assert.equal(res.finalCategoryId, "cat_domain");
  assert.ok(res.reason.overrides.some((o) => o.overriddenSource === "llm"));
});

test("Protected category blocks archive", () => {
  const categoriesById = {
    cat_protected: { id: "cat_protected", name: "Work", protectedFromAutoArchive: true },
  };

  const res = decideEmail(
    makeEmailEvent({ from_: "Boss <boss@company.com>", senderDomain: "company.com" }),
    makeCtx({
      categoriesById,
      personRules: [{ email: "boss@company.com", categoryId: "cat_protected" }],
      categoryPoliciesById: {
        cat_protected: { action: "archive_after_48h" },
      },
    })
  );

  assert.equal(res.finalCategoryId, "cat_protected");
  assert.notEqual(res.action, "ARCHIVE_AT");
  assert.equal(res.archiveAt, null);
  assert.ok(res.reason.overrides.some((o) => o.overriddenSource === "protectedCategory"));
});

test("archiveAt calculation correct (48h after arrival)", () => {
  const categoriesById = {
    cat: { id: "cat", name: "Low-priority", protectedFromAutoArchive: false },
  };

  const res = decideEmail(
    makeEmailEvent({
      from_: "Sender <sender@example.com>",
      senderDomain: "example.com",
      date: new Date("2026-02-10T00:00:00.000Z"),
    }),
    makeCtx({
      categoriesById,
      orgRules: [{ domain: "example.com", categoryId: "cat" }],
      categoryPoliciesById: { cat: { action: "archive_after_48h" } },
    })
  );

  assert.equal(res.action, "ARCHIVE_AT");
  assert.equal(res.archiveAt, "2026-02-12T00:00:00.000Z");
});

test("Default fallback works (Other)", () => {
  const categoriesById = {
    cat_other: { id: "cat_other", name: "Other", protectedFromAutoArchive: false },
  };

  const res = decideEmail(
    makeEmailEvent({
      from_: "Unknown <unknown@unknown.com>",
      senderDomain: "unknown.com",
      classificationCategoryId: null,
      explainJson: null,
    }),
    makeCtx({
      categoriesById,
      categoryPoliciesById: { cat_other: { action: "never" } },
      personRules: [],
      orgRules: [],
      llmEnabled: false,
    })
  );

  assert.equal(res.reason.winner, "default");
  assert.equal(res.finalCategoryId, "cat_other");
  assert.equal(res.action, "NONE");
});



