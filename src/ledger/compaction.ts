import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeJson } from "../fsx.js";
import { statePath } from "../paths.js";
import { readLedgerEvents } from "./jsonlStore.js";

export function compactLedger(ledgerName: string, keepTail = 500): { snapshot_path: string; retained_events: number } {
  const events = readLedgerEvents(ledgerName, keepTail);
  const snapshotDir = statePath("snapshots");
  ensureDir(snapshotDir);
  const snapshotPath = path.join(snapshotDir, `${ledgerName}-${Date.now()}.json`);
  writeJson(snapshotPath, { ledger: ledgerName, created_at: new Date().toISOString(), events });
  return { snapshot_path: snapshotPath, retained_events: events.length };
}

export function listSnapshots(): string[] {
  const dir = statePath("snapshots");
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
}
