import crypto from "node:crypto";
import type { FileChunk } from "../types.js";

export interface ChunkOptions {
  path: string;
  text: string;
  maxChars?: number;
  startLine?: number;
  numLines?: number;
}

export function chunkText(options: ChunkOptions): { chunks: FileChunk[]; truncated: boolean; lineRange: [number, number] | null } {
  const maxChars = options.maxChars ?? 12000;
  const allLines = options.text.split(/\r?\n/);
  const start = options.startLine ? Math.max(1, options.startLine) : 1;
  const startIndex = start - 1;
  const endIndex = options.numLines ? Math.min(allLines.length, startIndex + options.numLines) : allLines.length;
  const selectedLines = allLines.slice(startIndex, endIndex);
  let selected = selectedLines.join("\n");
  let truncated = endIndex < allLines.length || start > 1;
  if (selected.length > maxChars) {
    selected = selected.slice(0, maxChars);
    truncated = true;
  }

  const chunks: FileChunk[] = [];
  let offset = 0;
  const chunkSize = Math.min(4000, maxChars);
  while (offset < selected.length || (selected.length === 0 && chunks.length === 0)) {
    const piece = selected.slice(offset, offset + chunkSize);
    const prefix = selected.slice(0, offset);
    const startLine = start + countNewlines(prefix);
    const endLine = startLine + Math.max(0, countNewlines(piece));
    chunks.push({
      chunk_id: `chunk_${crypto.createHash("sha256").update(`${options.path}:${startLine}:${piece}`).digest("hex").slice(0, 16)}`,
      citation: `${options.path}:${startLine}-${endLine}`,
      start_line: startLine,
      end_line: endLine,
      text: piece,
      bytes: Buffer.byteLength(piece, "utf8")
    });
    offset += chunkSize;
    if (!piece) {
      break;
    }
  }

  return {
    chunks,
    truncated,
    lineRange: selectedLines.length ? [start, start + selectedLines.length - 1] : null
  };
}

function countNewlines(input: string): number {
  return (input.match(/\n/g) ?? []).length;
}
