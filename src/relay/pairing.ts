import crypto from "node:crypto";
import { appendLedgerEvent } from "../ledger/jsonlStore.js";

export interface PairingCode {
  ok: true;
  pairing_id: string;
  code: string;
  expires_at: string;
  policy: "remote_read_restricted";
}

export function createPairingCode(ttlSeconds = 300): PairingCode {
  const code: PairingCode = {
    ok: true,
    pairing_id: `pair_${crypto.randomUUID()}`,
    code: crypto.randomBytes(4).toString("hex").toUpperCase(),
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    policy: "remote_read_restricted"
  };
  appendLedgerEvent("audit", "relay_pairing_created", {
    pairing_id: code.pairing_id,
    expires_at: code.expires_at,
    policy: code.policy
  });
  return code;
}
