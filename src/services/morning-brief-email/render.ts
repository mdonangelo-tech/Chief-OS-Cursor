import type {
  MorningBriefCalendarHighlight,
  MorningBriefCriticalEmail,
  MorningBriefEmail,
  MorningBriefEmailItem,
} from "./types";

export interface RenderMorningBriefEmailOptions {
  briefUrl: string;
  settingsUrl: string;
}

export interface RenderedMorningBriefEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function itemHtml(item: MorningBriefEmailItem): string {
  const meta = [item.source, item.confidence ? `${item.confidence} confidence` : null]
    .filter(Boolean)
    .join(" · ");
  return `<li style="margin:0 0 12px 0;"><strong>${escapeHtml(item.title)}</strong><br><span style="color:#475569;">${escapeHtml(item.rationale)}</span>${item.suggestedAction ? `<br><span style="color:#64748b;">Next: ${escapeHtml(item.suggestedAction)}</span>` : ""}${meta ? `<br><span style="color:#94a3b8;font-size:12px;">${escapeHtml(meta)}</span>` : ""}</li>`;
}

function calendarHtml(item: MorningBriefCalendarHighlight): string {
  return `<li style="margin:0 0 12px 0;"><strong>${escapeHtml(item.time)} · ${escapeHtml(item.title)}</strong><br><span style="color:#475569;">${escapeHtml(item.rationale)}</span>${item.prepNeeded ? `<br><span style="color:#64748b;">Prep: ${escapeHtml(item.prepNeeded)}</span>` : ""}${item.source ? `<br><span style="color:#94a3b8;font-size:12px;">${escapeHtml(item.source)}</span>` : ""}</li>`;
}

function groupLabel(group: MorningBriefCriticalEmail["group"]): string {
  switch (group) {
    case "needs_response":
      return "Needs response";
    case "blocking_someone":
      return "Blocking someone";
    case "external_high_importance":
      return "External or high-importance";
    case "deadline_sensitive":
      return "Deadline-sensitive";
    case "sensitive":
      return "Sensitive";
    case "follow_up_overdue":
      return "Follow-up overdue";
  }
}

function criticalEmailHtml(item: MorningBriefCriticalEmail): string {
  return `<li style="margin:0 0 12px 0;"><strong>${escapeHtml(groupLabel(item.group))}: ${escapeHtml(item.title)}</strong><br><span style="color:#475569;">${escapeHtml(item.sender)} · ${escapeHtml(item.rationale)}</span>${item.suggestedAction ? `<br><span style="color:#64748b;">Next: ${escapeHtml(item.suggestedAction)}</span>` : ""}</li>`;
}

function section(title: string, body: string): string {
  if (!body.trim()) return "";
  return `<section style="margin-top:28px;"><h2 style="font-size:16px;line-height:22px;margin:0 0 10px 0;color:#0f172a;">${escapeHtml(title)}</h2>${body}</section>`;
}

function list(items: string[]): string {
  if (items.length === 0) return "";
  return `<ul style="padding-left:20px;margin:0;">${items.join("")}</ul>`;
}

function itemText(item: MorningBriefEmailItem): string {
  const lines = [`- ${item.title}: ${item.rationale}`];
  if (item.suggestedAction) lines.push(`  Next: ${item.suggestedAction}`);
  return lines.join("\n");
}

export function renderMorningBriefEmail(
  brief: MorningBriefEmail,
  options: RenderMorningBriefEmailOptions
): RenderedMorningBriefEmail {
  const subject = `Morning Brief: ${brief.date}`;
  const limited = brief.dataFreshness.isLimited
    ? `<p style="margin:16px 0 0 0;color:#64748b;font-size:13px;">Limited brief: ${escapeHtml(
        brief.dataFreshness.staleSources.length > 0
          ? `${brief.dataFreshness.staleSources.join(", ")} data may be stale.`
          : "a sync warning is present."
      )}</p>`
    : "";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:32px 20px;">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;padding:28px;">
        <p style="margin:0 0 8px 0;color:#64748b;font-size:13px;letter-spacing:.02em;text-transform:uppercase;">ChiefOS Morning Brief</p>
        <h1 style="font-size:24px;line-height:30px;margin:0;color:#0f172a;">Here’s what deserves your attention today.</h1>
        <p style="font-size:15px;line-height:24px;color:#334155;margin:16px 0 0 0;">${escapeHtml(brief.openingSummary)}</p>
        ${limited}
        ${section("Today’s Priorities", list(brief.todayPriorities.map(itemHtml)))}
        ${section("Calendar Intelligence", list(brief.calendarHighlights.map(calendarHtml)))}
        ${section("Critical Emails", list(brief.criticalEmails.map(criticalEmailHtml)))}
        ${section("Risks And Open Loops", list(brief.risksAndOpenLoops.map(itemHtml)))}
        ${
          brief.suggestedFocusPlan
            ? section(
                "Suggested Focus Plan",
                `<p style="font-size:14px;line-height:22px;color:#475569;margin:0;">${escapeHtml(brief.suggestedFocusPlan)}</p>`
              )
            : ""
        }
        <div style="margin-top:30px;">
          <a href="${escapeHtml(options.briefUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:12px;padding:12px 16px;font-weight:600;">Open live Brief</a>
        </div>
        <p style="font-size:12px;line-height:18px;color:#94a3b8;margin:28px 0 0 0;">
          Generated at ${escapeHtml(brief.generatedAt)} for ${escapeHtml(brief.timezone)}.
          Manage Morning Brief Email in <a href="${escapeHtml(options.settingsUrl)}" style="color:#64748b;">Settings → Brief freshness</a>.
        </p>
      </div>
    </div>
  </body>
</html>`;

  const textParts = [
    "ChiefOS Morning Brief",
    "",
    "Here's what deserves your attention today.",
    brief.openingSummary,
    brief.dataFreshness.isLimited
      ? `Limited brief: ${
          brief.dataFreshness.staleSources.length > 0
            ? `${brief.dataFreshness.staleSources.join(", ")} data may be stale.`
            : "a sync warning is present."
        }`
      : null,
    "",
    "Today's Priorities",
    ...brief.todayPriorities.map(itemText),
    "",
    "Calendar Intelligence",
    ...brief.calendarHighlights.map((item) => itemText({ ...item, title: `${item.time} · ${item.title}` })),
    "",
    "Critical Emails",
    ...brief.criticalEmails.map((item) =>
      itemText({ ...item, title: `${groupLabel(item.group)}: ${item.title}`, rationale: `${item.sender} · ${item.rationale}` })
    ),
    "",
    "Risks And Open Loops",
    ...brief.risksAndOpenLoops.map(itemText),
    brief.suggestedFocusPlan ? `\nSuggested Focus Plan\n${brief.suggestedFocusPlan}` : null,
    "",
    `Open live Brief: ${options.briefUrl}`,
    `Manage settings: ${options.settingsUrl}`,
  ].filter((part): part is string => typeof part === "string");

  return {
    subject,
    html,
    text: textParts.join("\n"),
  };
}
