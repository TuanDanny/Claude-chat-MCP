import path from "node:path";
import { appendLedgerEvent, readAllLedgerEvents } from "../ledger/jsonlStore.js";
import { rootHint } from "../paths.js";
import type { LedgerEvent, RootPolicy, RootRecord } from "../types.js";
import { defaultRootPolicy, validateRootId, validateRootPath } from "./policy.js";

type RootEventPayload =
  | { root: RootRecord }
  | { root_id: string; removed_at: string }
  | { root_id: string; policy: Partial<RootPolicy>; updated_at: string };

export function addRoot(rootInput: string, idInput?: string, policy: Partial<RootPolicy> = {}): RootRecord {
  const root = validateRootPath(rootInput);
  const fallbackId = path.basename(root).replace(/[^A-Za-z0-9._-]+/g, "-") || "root";
  const id = validateRootId(idInput ?? fallbackId);
  const now = new Date().toISOString();
  const existing = findRoot(id);
  const record: RootRecord = {
    root_id: id,
    name: path.basename(root) || id,
    root_hint: rootHint(root),
    absolute_path_local_only: root,
    created_at: existing?.created_at ?? now,
    last_seen: now,
    policy: { ...defaultRootPolicy, ...existing?.policy, ...policy, write: false }
  };
  appendLedgerEvent("roots", "root_added", { root: record });
  return record;
}

export function removeRoot(rootIdInput: string): boolean {
  const root_id = validateRootId(rootIdInput);
  const found = Boolean(findRoot(root_id));
  appendLedgerEvent("roots", "root_removed", { root_id, removed_at: new Date().toISOString() });
  return found;
}

export function listRoots(includeRemoved = false): RootRecord[] {
  const map = new Map<string, RootRecord>();
  for (const event of readAllLedgerEvents<RootEventPayload>("roots")) {
    if (event.type === "root_added" && "root" in event.payload) {
      map.set(event.payload.root.root_id.toLowerCase(), event.payload.root);
    }
    if (event.type === "root_policy_updated" && "policy" in event.payload) {
      const existing = map.get(event.payload.root_id.toLowerCase());
      if (existing) {
        map.set(event.payload.root_id.toLowerCase(), {
          ...existing,
          last_seen: event.payload.updated_at,
          policy: { ...existing.policy, ...event.payload.policy, write: false }
        });
      }
    }
    if (event.type === "root_removed" && "removed_at" in event.payload) {
      const existing = map.get(event.payload.root_id.toLowerCase());
      if (existing) {
        map.set(event.payload.root_id.toLowerCase(), { ...existing, removed: true, last_seen: event.payload.removed_at });
      }
    }
  }
  return [...map.values()].filter((root) => includeRemoved || !root.removed).sort((a, b) => a.root_id.localeCompare(b.root_id));
}

export function findRoot(rootIdInput: string): RootRecord | undefined {
  const rootId = validateRootId(rootIdInput);
  return listRoots().find((root) => root.root_id.toLowerCase() === rootId.toLowerCase());
}

export function requireRoot(rootIdInput: string): RootRecord {
  const root = findRoot(rootIdInput);
  if (!root) {
    throw new Error(`Root is not registered: ${rootIdInput}`);
  }
  return root;
}

export function publicRootView(root: RootRecord): Omit<RootRecord, "absolute_path_local_only"> {
  const { absolute_path_local_only: _hidden, ...publicRoot } = root;
  return publicRoot;
}

export function rootLedgerEvents(limit = 100): Array<LedgerEvent<RootEventPayload>> {
  return readAllLedgerEvents<RootEventPayload>("roots").slice(-limit);
}
