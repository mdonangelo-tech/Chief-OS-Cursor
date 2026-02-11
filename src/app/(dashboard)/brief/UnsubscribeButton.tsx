"use client";

import { useState } from "react";

interface UnsubscribeButtonProps {
  emailEventId?: string;
  messageId?: string;
  googleAccountId?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function UnsubscribeButton({
  emailEventId,
  messageId,
  googleAccountId,
  className = "",
  onClick,
}: UnsubscribeButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "open" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const handleClick = async (e: React.MouseEvent) => {
    onClick?.(e);
    e.stopPropagation();
    if (!emailEventId && !(messageId && googleAccountId)) return;
    if (status === "loading" || status === "done") return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/gmail/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          emailEventId ? { emailEventId } : { messageId, googleAccountId }
        ),
      });
      const data = (await res.json()) as {
        action?: string;
        url?: string;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        setErrorMsg(data.error ?? "Failed");
        setStatus("error");
        return;
      }

      if (data.action === "done") {
        setStatus("done");
      } else if (data.action === "open" && data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        setStatus("open");
      } else {
        setStatus("idle");
      }
    } catch {
      setErrorMsg("Request failed");
      setStatus("error");
    }
  };

  if (status === "done") {
    return <span className={`text-xs text-emerald-500 ${className}`}>✓ Unsubscribed</span>;
  }
  if (status === "error") {
    return (
      <span className={`text-xs text-red-500 ${className}`} title={errorMsg}>
        {errorMsg}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading"}
      className={`${className} ${status === "loading" ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      {status === "loading" ? "…" : "Unsubscribe"}
    </button>
  );
}
