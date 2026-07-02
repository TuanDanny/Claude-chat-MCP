import { appendLedgerEvent, readLedgerEvents } from "../ledger/jsonlStore.js";

export function audit(type: string, payload: Record<string, unknown>): void {
  appendLedgerEvent("audit", type, payload);
}

export function auditSummary(limit = 50): { ok: true; events: unknown[] } {
  return { ok: true, events: readLedgerEvents("audit", limit) };
}
