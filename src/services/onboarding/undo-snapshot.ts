import { Prisma } from "@prisma/client";

export type UndoSnapshot = {
  createdIds: Array<{ model: string; id: string }>;
  updated: Array<{
    model: string;
    id: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }>;
  deleted: Array<{ model: string; row: Record<string, unknown> }>;
};

export function emptyUndoSnapshot(): UndoSnapshot {
  return { createdIds: [], updated: [], deleted: [] };
}

export function asUndoSnapshot(v: unknown): UndoSnapshot {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as any) : null;
  const createdIds = Array.isArray(o?.createdIds) ? o.createdIds : [];
  const updated = Array.isArray(o?.updated) ? o.updated : [];
  const deleted = Array.isArray(o?.deleted) ? o.deleted : [];
  return {
    createdIds: createdIds.filter(Boolean),
    updated: updated.filter(Boolean),
    deleted: deleted.filter(Boolean),
  } as UndoSnapshot;
}

export function appendUndo(
  current: unknown,
  delta: Partial<UndoSnapshot>
): Prisma.InputJsonValue {
  const snap = asUndoSnapshot(current);
  const merged: UndoSnapshot = {
    createdIds: [...snap.createdIds, ...(delta.createdIds ?? [])],
    updated: [...snap.updated, ...(delta.updated ?? [])],
    deleted: [...snap.deleted, ...(delta.deleted ?? [])],
  };
  return JSON.parse(JSON.stringify(merged)) as Prisma.InputJsonValue;
}

