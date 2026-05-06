export function formatFriendlyDateTime(date: Date, now: Date = new Date()): string {
  const d = date;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  const datePart = d.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });

  if (d >= startOfToday && d < startOfTomorrow) return `Today at ${time}`;
  if (d >= startOfYesterday && d < startOfToday) return `Yesterday at ${time}`;
  return `${datePart}, ${time}`;
}

