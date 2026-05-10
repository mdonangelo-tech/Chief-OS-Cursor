"use client";

import useSWR from "swr";
import type { BriefPayload } from "@/services/brief/api-brief";
import { SuggestedActionsSection } from "./SuggestedActionsSection";
import { BriefContentClient } from "./BriefContentClient";
import { DeclutterSection } from "./DeclutterSection";

async function fetchBrief(url: string): Promise<BriefPayload> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Brief request failed (${res.status})`);
  }
  return res.json() as Promise<BriefPayload>;
}

export function BriefContent({ payload }: { payload: BriefPayload }) {
  const { data } = useSWR<BriefPayload>("/api/brief", fetchBrief, {
    fallbackData: payload,
    revalidateOnFocus: true,
    dedupingInterval: 5000,
  });
  const p = data ?? payload;

  return (
    <div className="space-y-10">
      <BriefContentClient payload={p} />
      <SuggestedActionsSection actions={p.suggestedActions ?? []} />
      <DeclutterSection summary={p.digest.summary} />
    </div>
  );
}
