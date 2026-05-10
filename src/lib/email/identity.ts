import { getDomain } from "tldts";

const SHARED_HOST_DOMAINS = new Set([
  "github.io",
  "vercel.app",
  "substack.com",
  "medium.com",
  "netlify.app",
  "pages.dev",
  "web.app",
  "firebaseapp.com",
  "herokuapp.com",
  "glitch.me",
]);

export function normalizeEmailAddress(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/<([^>]+)>/);
  const raw = (match?.[1] ?? value).trim().toLowerCase();
  if (!raw.includes("@")) return null;
  const parts = raw.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const domain = normalizeDomain(parts[1]);
  return domain ? `${parts[0]}@${domain}` : null;
}

export function extractEmailAddress(fromHeader: string | null | undefined): string | null {
  return normalizeEmailAddress(fromHeader);
}

export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  const fromEmail = trimmed.includes("@") ? trimmed.slice(trimmed.lastIndexOf("@") + 1) : trimmed;
  const cleaned = fromEmail
    .replace(/^mailto:/, "")
    .replace(/[>\])"'.,;:]+$/g, "")
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!cleaned || cleaned.includes("/") || cleaned.includes(" ")) return null;
  const labels = cleaned.split(".").filter(Boolean);
  if (labels.length < 2) return null;
  return labels.join(".");
}

export function extractDomainFromEmailOrHeader(value: string | null | undefined): string | null {
  const email = extractEmailAddress(value);
  if (email) return normalizeDomain(email.slice(email.lastIndexOf("@") + 1));
  return normalizeDomain(value);
}

export function canonicalOrgDomain(value: string | null | undefined): string | null {
  const domain = normalizeDomain(value);
  if (!domain) return null;
  const registrableDomain = getDomain(domain, { allowPrivateDomains: true }) ?? domain;
  if (registrableDomain !== domain && SHARED_HOST_DOMAINS.has(registrableDomain)) {
    return domain;
  }
  return registrableDomain;
}

export function domainVariants(value: string | null | undefined): string[] {
  const exact = normalizeDomain(value);
  if (!exact) return [];
  const canonical = canonicalOrgDomain(exact);
  return canonical && canonical !== exact ? [exact, canonical] : [exact];
}

export function suggestionSuppressionKeys(args: {
  email?: string | null;
  domain?: string | null;
}): Array<{ type: "person" | "domain"; value: string }> {
  const keys: Array<{ type: "person" | "domain"; value: string }> = [];
  const email = normalizeEmailAddress(args.email);
  if (email) keys.push({ type: "person", value: email });
  for (const value of domainVariants(args.domain)) {
    keys.push({ type: "domain", value });
  }
  return keys;
}
