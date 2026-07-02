import crypto from "node:crypto";
import { appendLedgerEvent, readLedgerEvents } from "../ledger/jsonlStore.js";
import type { ContextPacket, FileUnderstanding } from "../types.js";

export function buildContextPacket(input: {
  rootId: string;
  query?: string;
  budget?: number;
  filesRequested: string[];
  understandings: FileUnderstanding[];
  skipped: Array<{ path: string; reason: string }>;
}): ContextPacket {
  const budget = input.budget ?? 24000;
  const sections: string[] = [];
  const citations: string[] = [];
  let used = 0;
  for (const understanding of input.understandings) {
    for (const chunk of understanding.chunks) {
      const section = `## ${understanding.path}\nCitation: ${chunk.citation}\nStatus: ${understanding.understanding_status}\n\n${chunk.text}\n`;
      if (used + section.length > budget) {
        input.skipped.push({ path: understanding.path, reason: "context_budget_exhausted" });
        break;
      }
      sections.push(section);
      citations.push(chunk.citation);
      used += section.length;
    }
  }
  const packet: ContextPacket = {
    ok: true,
    packet_id: `packet_${crypto.randomUUID()}`,
    created_at: new Date().toISOString(),
    root_id: input.rootId,
    query: input.query ?? null,
    budget,
    used_chars: used,
    files_requested: input.filesRequested,
    files_read: input.understandings.map((item) => item.path),
    files_skipped: input.skipped,
    citations,
    content: sections.join("\n"),
    coverage_warning: input.skipped.length ? "Some requested files or chunks were skipped. Do not claim complete coverage." : null
  };
  appendLedgerEvent("context_packets", "context_packet_built", packet as unknown as Record<string, unknown>);
  return packet;
}

export function resumeContext(packetId?: string): { ok: true; packets: unknown[] } {
  const packets = readLedgerEvents("context_packets", 100)
    .map((event) => event.payload)
    .filter((packet) => (!packetId ? true : (packet as { packet_id?: string }).packet_id === packetId));
  return { ok: true, packets };
}
