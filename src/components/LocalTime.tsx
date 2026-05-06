"use client";

import { useEffect, useMemo, useState } from "react";
import { formatFriendlyDateTime } from "@/lib/datetime";

type LocalTimeProps = {
  value: string | Date | null | undefined;
  className?: string;
  title?: string;
  emptyText?: string;
};

function coerceDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function LocalTime({ value, className, title, emptyText = "—" }: LocalTimeProps) {
  const date = useMemo(() => coerceDate(value), [value]);
  const [text, setText] = useState<string>(emptyText);

  useEffect(() => {
    if (!date) {
      setText(emptyText);
      return;
    }
    setText(formatFriendlyDateTime(date));
  }, [date, emptyText]);

  return (
    <time
      className={className}
      dateTime={date ? date.toISOString() : undefined}
      suppressHydrationWarning
      title={title}
    >
      {text}
    </time>
  );
}

