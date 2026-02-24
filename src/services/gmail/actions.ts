/**
 * Gmail actions: archive with audit, rollback.
 * Auto-archive is opt-in; this provides the infrastructure.
 */

import { prisma } from "@/lib/prisma";
import { getGoogleAccountWithTokens } from "@/lib/google-accounts";
import { refreshAccessToken } from "@/lib/google-oauth";
import { getOrCreateChiefOSArchivedLabel } from "@/services/gmail/labels";

async function getValidAccessToken(accountId: string, userId: string): Promise<string> {
  const account = await getGoogleAccountWithTokens(accountId, userId);
  if (!account) throw new Error("Google account not found");

  const now = Date.now();
  const expiryMs = account.tokenExpiry?.getTime() ?? 0;
  const shouldRefresh = !account.accessToken || expiryMs - now < 5 * 60 * 1000;

  // #region agent log
  // #endregion

  if (shouldRefresh) {
    let tokens;
    try {
      tokens = await refreshAccessToken(account.refreshToken);
    } catch (e) {
      try {
        const { appendFileSync } = await import("node:fs");
        appendFileSync(
          "/Users/mdonangelo/Chief-OS-Cursor/.cursor/debug.log",
          JSON.stringify({
            runId: "auto-archive",
            hypothesisId: "H1",
            location: "src/services/gmail/actions.ts:getValidAccessToken:fallbackFileLog",
            message: "refreshAccessToken threw error (file fallback)",
            data: { accountId, err: (e as Error)?.message ?? String(e) },
            timestamp: Date.now(),
          }) + "\n"
        );
      } catch {
        // ignore
      }
      // #region agent log
      // #endregion
      throw e;
    }
    await prisma.googleAccount.update({
      where: { id: accountId },
      data: {
        accessToken: tokens.access_token,
        tokenExpiry: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        updatedAt: new Date(),
      },
    });
    return tokens.access_token;
  }
  if (!account.accessToken) {
    throw new Error("Missing access token");
  }
  return account.accessToken;
}

async function getMessageLabels(
  token: string,
  messageId: string
): Promise<string[]> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=Label`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Gmail get message error: ${res.status}`);
  const data = (await res.json()) as { labelIds?: string[] };
  return data.labelIds ?? [];
}

async function modifyMessageLabels(
  token: string,
  messageId: string,
  add: string[],
  remove: string[]
): Promise<void> {
  const body: Record<string, string[]> = {};
  if (add.length) body.addLabelIds = add;
  if (remove.length) body.removeLabelIds = remove;
  if (Object.keys(body).length === 0) return;

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Gmail modify error: ${res.status} ${await res.text()}`);
}

const BATCH_MODIFY_LIMIT = 1000;

/** Archive up to 1000 messages in one API call. For undo, stores simplified before/after. */
export async function batchArchiveMessages(
  userId: string,
  googleAccountId: string,
  messageIds: string[],
  reason: string,
  runId?: string
): Promise<{ archived: number; errors: string[] }> {
  if (messageIds.length === 0) return { archived: 0, errors: [] };
  if (messageIds.length > BATCH_MODIFY_LIMIT) {
    throw new Error(`batchArchiveMessages: max ${BATCH_MODIFY_LIMIT} per call, got ${messageIds.length}`);
  }

  const account = await prisma.googleAccount.findFirst({
    where: { id: googleAccountId, userId },
  });
  if (!account) throw new Error("Google account not found");

  const token = await getValidAccessToken(googleAccountId, userId);
  const chiefOsLabelId = await getOrCreateChiefOSArchivedLabel(googleAccountId, userId);

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ids: messageIds,
        addLabelIds: [chiefOsLabelId],
        removeLabelIds: ["INBOX"],
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Gmail batchModify error: ${res.status} ${await res.text()}`);
  }

  await prisma.auditLog.createMany({
    data: messageIds.map((messageId) => ({
      userId,
      googleAccountId,
      messageId,
      runId: runId ?? null,
      actionType: "ARCHIVE" as const,
      reason,
      confidence: 0.95,
      beforeLabelsJson: ["INBOX"],
      afterLabelsJson: [chiefOsLabelId],
      rollbackStatus: "applied" as const,
    })),
  });

  return { archived: messageIds.length, errors: [] };
}

/** Move a message to Gmail Spam folder. Audited as actionType SPAM for rollback. */
export async function moveToSpamMessage(
  userId: string,
  googleAccountId: string,
  messageId: string,
  reason: string,
  confidence?: number,
  runId?: string
): Promise<{ auditLogId: string }> {
  const account = await prisma.googleAccount.findFirst({
    where: { id: googleAccountId, userId },
  });
  if (!account) throw new Error("Google account not found");

  const token = await getValidAccessToken(googleAccountId, userId);
  const beforeLabels = await getMessageLabels(token, messageId);

  const add = ["SPAM"];
  const remove = beforeLabels.includes("INBOX") ? ["INBOX"] : [];

  await modifyMessageLabels(token, messageId, add, remove);
  const afterLabels = await getMessageLabels(token, messageId);

  const audit = await prisma.auditLog.create({
    data: {
      userId,
      googleAccountId,
      messageId,
      runId: runId ?? null,
      actionType: "SPAM",
      reason,
      confidence: confidence ?? null,
      beforeLabelsJson: beforeLabels,
      afterLabelsJson: afterLabels,
      rollbackStatus: "applied",
    },
  });

  return { auditLogId: audit.id };
}

export async function archiveMessage(
  userId: string,
  googleAccountId: string,
  messageId: string,
  reason: string,
  confidence?: number,
  runId?: string
): Promise<{ auditLogId: string }> {
  const account = await prisma.googleAccount.findFirst({
    where: { id: googleAccountId, userId },
  });
  if (!account) throw new Error("Google account not found");

  const token = await getValidAccessToken(googleAccountId, userId);
  const beforeLabels = await getMessageLabels(token, messageId);

  const chiefOsLabelId = await getOrCreateChiefOSArchivedLabel(
    googleAccountId,
    userId
  );

  const add = [chiefOsLabelId];
  const remove = beforeLabels.includes("INBOX") ? ["INBOX"] : [];

  await modifyMessageLabels(token, messageId, add, remove);
  const afterLabels = await getMessageLabels(token, messageId);

  const audit = await prisma.auditLog.create({
    data: {
      userId,
      googleAccountId,
      messageId,
      runId: runId ?? null,
      actionType: "ARCHIVE",
      reason,
      confidence: confidence ?? null,
      beforeLabelsJson: beforeLabels,
      afterLabelsJson: afterLabels,
      rollbackStatus: "applied",
    },
  });

  return { auditLogId: audit.id };
}

export async function rollbackArchive(
  userId: string,
  auditLogId: string
): Promise<void> {
  const audit = await prisma.auditLog.findFirst({
    where: { id: auditLogId, userId },
  });
  if (!audit) throw new Error("Audit log not found");
  if (audit.rollbackStatus === "reverted") throw new Error("Already reverted");
  if (!audit.messageId) throw new Error("No message to rollback");

  const token = await getValidAccessToken(audit.googleAccountId, userId);
  const chiefOsLabelId = await getOrCreateChiefOSArchivedLabel(
    audit.googleAccountId,
    userId
  );

  const beforeLabels = audit.beforeLabelsJson as string[];
  const currentLabels = await getMessageLabels(token, audit.messageId);

  const add = beforeLabels.includes("INBOX") && !currentLabels.includes("INBOX")
    ? ["INBOX"]
    : [];
  const remove = currentLabels.includes(chiefOsLabelId) ? [chiefOsLabelId] : [];

  for (const label of beforeLabels) {
    if (label !== "INBOX" && !currentLabels.includes(label)) {
      add.push(label);
    }
  }

  await modifyMessageLabels(token, audit.messageId, add, remove);

  await prisma.auditLog.update({
    where: { id: auditLogId },
    data: { rollbackStatus: "reverted", timestamp: new Date() },
  });
}

/** Undo a spam action: move message back to INBOX, remove SPAM. */
export async function rollbackSpam(
  userId: string,
  auditLogId: string
): Promise<void> {
  const audit = await prisma.auditLog.findFirst({
    where: { id: auditLogId, userId },
  });
  if (!audit) throw new Error("Audit log not found");
  if (audit.rollbackStatus === "reverted") throw new Error("Already reverted");
  if (!audit.messageId) throw new Error("No message to rollback");
  if (audit.actionType !== "SPAM") throw new Error("Not a spam action");

  const token = await getValidAccessToken(audit.googleAccountId, userId);
  const beforeLabels = audit.beforeLabelsJson as string[];
  const currentLabels = await getMessageLabels(token, audit.messageId);

  const add = beforeLabels.includes("INBOX") ? ["INBOX"] : [];
  const remove = currentLabels.includes("SPAM") ? ["SPAM"] : [];

  await modifyMessageLabels(token, audit.messageId, add, remove);

  await prisma.auditLog.update({
    where: { id: auditLogId },
    data: { rollbackStatus: "reverted", timestamp: new Date() },
  });
}

/** Undo an entire auto-archive run. Reverts all audit entries with the given runId. */
export async function rollbackRun(
  userId: string,
  runId: string
): Promise<{ reverted: number; errors: string[] }> {
  const audits = await prisma.auditLog.findMany({
    where: {
      userId,
      runId,
      actionType: { in: ["ARCHIVE", "SPAM"] },
      rollbackStatus: "applied",
    },
  });
  let reverted = 0;
  const errors: string[] = [];
  for (const audit of audits) {
    if (!audit.messageId) continue;
    try {
      if (audit.actionType === "SPAM") {
        await rollbackSpam(userId, audit.id);
      } else {
        await rollbackArchive(userId, audit.id);
      }
      reverted++;
    } catch (err) {
      errors.push(`${audit.messageId}: ${(err as Error).message}`);
    }
  }
  return { reverted, errors };
}
