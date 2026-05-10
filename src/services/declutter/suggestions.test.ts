import test from "node:test";
import assert from "node:assert/strict";
import { buildRuleSuggestions } from "./suggestions";

const baseEvent = {
  id: "e1",
  from_: "Alice <alice@acme.com>",
  senderDomain: "acme.com",
  snippet: "Hi",
  confidence: 0.9,
  explainJson: null,
  classificationCategoryId: "cat1",
  category: { id: "cat1", name: "Work" },
  date: new Date(),
};

test("buildRuleSuggestions: domain org rule suppresses sender suggestion for same domain", () => {
  const out = buildRuleSuggestions({
    events: [baseEvent],
    knownEmails: new Set(),
    knownDomains: new Set(["acme.com"]),
    rejectedKeys: new Set(),
  });
  assert.equal(out.length, 0, "no suggestion when domain already has org rule");
});

test("buildRuleSuggestions: still suggests domain when only sender rule exists", () => {
  const out = buildRuleSuggestions({
    events: [baseEvent],
    knownEmails: new Set(["alice@acme.com"]),
    knownDomains: new Set(),
    rejectedKeys: new Set(),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.needsSender, false);
  assert.equal(out[0]!.needsDomain, true);
  assert.equal(out[0]!.recommendedRuleType, "domain");
});

test("buildRuleSuggestions: suggests sender when domain unknown and email unknown", () => {
  const out = buildRuleSuggestions({
    events: [baseEvent],
    knownEmails: new Set(),
    knownDomains: new Set(),
    rejectedKeys: new Set(),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.needsSender, true);
  assert.equal(out[0]!.needsDomain, true);
  assert.equal(out[0]!.recommendedRuleType, "domain");
});

test("buildRuleSuggestions: normalizes mixed-case domain against knownDomains", () => {
  const out = buildRuleSuggestions({
    events: [
      {
        ...baseEvent,
        id: "e2",
        from_: "Bob <bob@ACME.COM>",
        senderDomain: "ACME.COM",
      },
    ],
    knownEmails: new Set(),
    knownDomains: new Set(["acme.com"]),
    rejectedKeys: new Set(),
  });
  assert.equal(out.length, 0);
});
