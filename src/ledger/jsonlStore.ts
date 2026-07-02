import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "../fsx.js";
import { ledgerPath } from "../paths.js";
import type { LedgerEvent } from "../types.js";

export function appendLedgerEvent<T extends Record<string, unknown>>(ledgerName: string, type: string, payload: T): LedgerEvent<T> {
  const event: LedgerEvent<T> = {
    id: `${type}_${crypto.randomUUID()}`,
    type,
    created_at: new Date().toISOString(),
    payload
  };
  const filePath = ledgerPath(ledgerName);
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export function readLedgerEvents<T = Record<string, unknown>>(ledgerName: string, limit = 200): Array<LedgerEvent<T>> {
  const filePath = ledgerPath(ledgerName);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  return lines
    .slice(Math.max(0, lines.length - limit))
    .map((line) => JSON.parse(line) as LedgerEvent<T>);
}

export function readAllLedgerEvents<T = Record<string, unknown>>(ledgerName: string): Array<LedgerEvent<T>> {
  const filePath = ledgerPath(ledgerName);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as LedgerEvent<T>);
}
