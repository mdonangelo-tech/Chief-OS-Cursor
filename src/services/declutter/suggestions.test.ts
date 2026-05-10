import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKnownDomainSet,
  buildRejectedKeySet,
  buildRuleSuggestions,
} from "./suggestions";
import { canonicalOrgDomain } from "@/lib/email/identity";

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

test("canonicalOrgDomain: groups marketing subdomains by organization domain", () => {
  assert.equal(canonicalOrgDomain("news.wonderbly.com"), "wonderbly.com");
  assert.equal(canonicalOrgDomain("shop.example.co.uk"), "example.co.uk");
  assert.equal(canonicalOrgDomain("brand.co.in"), "brand.co.in");
  assert.equal(canonicalOrgDomain("shop.brand.co.in"), "brand.co.in");
});

test("canonicalOrgDomain: keeps shared-host tenants separate", () => {
  assert.equal(canonicalOrgDomain("tenant.github.io"), "tenant.github.io");
  assert.equal(canonicalOrgDomain("other.github.io"), "other.github.io");
  assert.equal(canonicalOrgDomain("tenant.vercel.app"), "tenant.vercel.app");
  assert.equal(canonicalOrgDomain("other.vercel.app"), "other.vercel.app");
  assert.equal(canonicalOrgDomain("author.medium.com"), "author.medium.com");
  assert.equal(canonicalOrgDomain("foo.substack.com"), "foo.substack.com");
});

test("buildRuleSuggestions: dedupes repeated events for the same domain and category", () => {
  const out = buildRuleSuggestions({
    events: [
      baseEvent,
      {
        ...baseEvent,
        id: "e2",
        date: new Date(Date.now() - 1000),
        snippet: "Another message",
      },
    ],
    knownEmails: new Set(),
    knownDomains: new Set(),
    rejectedKeys: new Set(),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.suggestionKey, "domain:acme.com:cat1");
});

test("buildRuleSuggestions: saved root domain suppresses subdomain suggestions", () => {
  const out = buildRuleSuggestions({
    events: [
      {
        ...baseEvent,
        from_: "Wonderbly <email-en@news.wonderbly.com>",
        senderDomain: "news.wonderbly.com",
      },
    ],
    knownEmails: new Set(),
    knownDomains: buildKnownDomainSet(["wonderbly.com"]),
    rejectedKeys: new Set(),
  });
  assert.equal(out.length, 0);
});

test("buildRuleSuggestions: saved subdomain suppresses sibling subdomain by canonical org", () => {
  const out = buildRuleSuggestions({
    events: [
      {
        ...baseEvent,
        from_: "Wonderbly <email@offers.wonderbly.com>",
        senderDomain: "offers.wonderbly.com",
      },
    ],
    knownEmails: new Set(),
    knownDomains: buildKnownDomainSet(["news.wonderbly.com"]),
    rejectedKeys: new Set(),
  });
  assert.equal(out.length, 0);
});

test("buildRuleSuggestions: github.io tenants do not suppress each other", () => {
  const out = buildRuleSuggestions({
    events: [
      {
        ...baseEvent,
        from_: "Tenant <noreply@other.github.io>",
        senderDomain: "other.github.io",
      },
    ],
    knownEmails: new Set(),
    knownDomains: buildKnownDomainSet(["tenant.github.io"]),
    rejectedKeys: new Set(),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.canonicalDomain, "other.github.io");
});

test("buildRuleSuggestions: vercel.app tenants do not suppress each other", () => {
  const out = buildRuleSuggestions({
    events: [
      {
        ...baseEvent,
        from_: "Tenant <noreply@other.vercel.app>",
        senderDomain: "other.vercel.app",
      },
    ],
    knownEmails: new Set(),
    knownDomains: buildKnownDomainSet(["tenant.vercel.app"]),
    rejectedKeys: new Set(),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.canonicalDomain, "other.vercel.app");
});

test("buildRuleSuggestions: shared content platform tenants do not suppress each other", () => {
  const out = buildRuleSuggestions({
    events: [
      {
        ...baseEvent,
        from_: "Publication <hello@bar.substack.com>",
        senderDomain: "bar.substack.com",
      },
    ],
    knownEmails: new Set(),
    knownDomains: buildKnownDomainSet(["foo.substack.com"]),
    rejectedKeys: new Set(),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.canonicalDomain, "bar.substack.com");
});

test("buildRuleSuggestions: co.in registrable domains do not collapse to public suffix", () => {
  const out = buildRuleSuggestions({
    events: [
      {
        ...baseEvent,
        from_: "Brand <hello@brand.co.in>",
        senderDomain: "brand.co.in",
      },
    ],
    knownEmails: new Set(),
    knownDomains: buildKnownDomainSet(["other.co.in"]),
    rejectedKeys: new Set(),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.canonicalDomain, "brand.co.in");
  assert.equal(out[0]!.suggestionKey, "domain:brand.co.in:cat1");
});

test("buildRuleSuggestions: mixed-case rejected domain suppresses normalized event domain", () => {
  const out = buildRuleSuggestions({
    events: [
      {
        ...baseEvent,
        from_: "Wonderbly <email-en@news.wonderbly.com>",
        senderDomain: "news.wonderbly.com",
      },
    ],
    knownEmails: new Set(),
    knownDomains: new Set(),
    rejectedKeys: buildRejectedKeySet([{ type: "domain", value: "News.Wonderbly.com" }]),
  });
  assert.equal(out.length, 0);
});

test("buildRuleSuggestions: stable key uses canonical domain for subdomain suggestions", () => {
  const out = buildRuleSuggestions({
    events: [
      {
        ...baseEvent,
        from_: "Wonderbly <email-en@news.wonderbly.com>",
        senderDomain: "news.wonderbly.com",
      },
    ],
    knownEmails: new Set(),
    knownDomains: new Set(),
    rejectedKeys: new Set(),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.domain, "news.wonderbly.com");
  assert.equal(out[0]!.canonicalDomain, "wonderbly.com");
  assert.equal(out[0]!.suggestionKey, "domain:wonderbly.com:cat1");
});
