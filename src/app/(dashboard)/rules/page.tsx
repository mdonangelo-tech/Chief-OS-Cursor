import { redirect } from "next/navigation";

/**
 * Rules are now part of Declutter (Email Actions section).
 * Redirect legacy /rules to /settings/declutter.
 */
export default function RulesPage() {
  redirect("/settings/declutter#email-actions");
}
