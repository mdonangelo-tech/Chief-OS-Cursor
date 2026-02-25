type EnvName = string;

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function shouldValidateEnvOnBoot(): boolean {
  // Enforce in real deployments (Vercel sets VERCEL=1) or when explicitly enabled.
  return isProd() && (process.env.VERCEL === "1" || (process.env.ENFORCE_ENV_VALIDATION ?? "") === "true");
}

function getEnv(name: EnvName): string | undefined {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function requireEnv(name: EnvName): string {
  const v = getEnv(name);
  if (!v) {
    throw new Error(`[env] Missing required env var: ${name}`);
  }
  return v;
}

function normalizeBool(v: string | undefined): boolean {
  return (v ?? "").toLowerCase().trim() === "true";
}

export function privateModeEnabled(): boolean {
  return normalizeBool(getEnv("PRIVATE_MODE"));
}

export function onboardingV1Enabled(): boolean {
  return normalizeBool(getEnv("ONBOARDING_V1_ENABLED"));
}

export function getAuthUrl(): string {
  const v = getEnv("AUTH_URL");
  if (v) return v;
  if (shouldValidateEnvOnBoot()) {
    throw new Error("[env] AUTH_URL is required in production.");
  }
  return "http://localhost:3000";
}

export function getPublicApiBaseUrl(): string {
  const v = getEnv("NEXT_PUBLIC_API_BASE_URL") ?? getEnv("VITE_API_BASE_URL");
  if (v) return v;
  return "";
}

export function validateRequiredEnv(): void {
  if (!shouldValidateEnvOnBoot()) return;

  requireEnv("AUTH_SECRET");
  requireEnv("AUTH_URL");
  requireEnv("DATABASE_URL");
  requireEnv("GOOGLE_CLIENT_ID");
  requireEnv("GOOGLE_CLIENT_SECRET");
  // Support both names; docs prefer ENCRYPTION_KEY but existing code may use TOKEN_ENCRYPTION_KEY.
  const encryptionKey = getEnv("ENCRYPTION_KEY") ?? getEnv("TOKEN_ENCRYPTION_KEY");
  if (!encryptionKey) {
    throw new Error("[env] Missing required env var: ENCRYPTION_KEY (or TOKEN_ENCRYPTION_KEY)");
  }

  // Public API base URL for frontend
  const apiBase = getEnv("NEXT_PUBLIC_API_BASE_URL") ?? getEnv("VITE_API_BASE_URL");
  if (!apiBase) {
    throw new Error(
      "[env] Missing required env var: NEXT_PUBLIC_API_BASE_URL (or VITE_API_BASE_URL)"
    );
  }

  if (privateModeEnabled()) {
    requireEnv("BASIC_AUTH_USER");
    requireEnv("BASIC_AUTH_PASSWORD");
  }
}

