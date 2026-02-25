export type InferredAccountType = "work" | "personal" | "unknown";

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "hey.com",
]);

export function inferAccountTypeFromEmail(email: string): InferredAccountType {
  const at = email.lastIndexOf("@");
  if (at < 0) return "unknown";
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain) return "unknown";
  if (PERSONAL_DOMAINS.has(domain)) return "personal";
  // Custom domains are usually work, but we'll let users override.
  return "work";
}

