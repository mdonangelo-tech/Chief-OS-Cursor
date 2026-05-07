import type { BriefPayload } from "@/services/brief/api-brief";
import { SuggestedActionsSection } from "./SuggestedActionsSection";
import { BriefContentClient } from "./BriefContentClient";

export function BriefContent({ payload }: { payload: BriefPayload }) {
  return (
    <div className="space-y-8">
      <SuggestedActionsSection actions={payload.suggestedActions ?? []} />
      <BriefContentClient payload={payload} />
    </div>
  );
}
