import crypto from "node:crypto";
import { appendLedgerEvent } from "../ledger/jsonlStore.js";

export interface FileChangeProposal {
  proposal_id: string;
  root_id: string;
  path: string;
  summary: string;
  patch: string;
  status: "pending_windows_ui";
  requires_confirmations: 2;
  created_at: string;
}

export function proposeFileChange(input: { root_id: string; path: string; summary: string; patch: string }): FileChangeProposal {
  const proposal: FileChangeProposal = {
    proposal_id: `proposal_${crypto.randomUUID()}`,
    root_id: input.root_id,
    path: input.path,
    summary: input.summary,
    patch: input.patch,
    status: "pending_windows_ui",
    requires_confirmations: 2,
    created_at: new Date().toISOString()
  };
  appendLedgerEvent("approvals", "file_change_proposed", proposal as unknown as Record<string, unknown>);
  return proposal;
}
