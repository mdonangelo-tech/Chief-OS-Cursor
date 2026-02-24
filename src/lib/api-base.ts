import { getPublicApiBaseUrl } from "@/lib/env";

function normalizePath(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function apiUrl(path: string): string {
  const p = normalizePath(path);
  const base = getPublicApiBaseUrl();
  if (!base) return p;
  return new URL(p, base.endsWith("/") ? base : `${base}/`).toString();
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), init);
}

