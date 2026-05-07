import type { BriefPayload } from "@/services/brief/api-brief";
import { SuggestedActionsSection } from "./SuggestedActionsSection";
import { BriefContentClient } from "./BriefContentClient";
import { DeclutterSection } from "./DeclutterSection";

export function BriefContent({ payload }: { payload: BriefPayload }) {
  return (
    <div className="space-y-10">
      <BriefContentClient payload={payload} />
      <SuggestedActionsSection actions={payload.suggestedActions ?? []} />
      <DeclutterSection summary={payload.digest.summary} />
    </div>
  );
}
