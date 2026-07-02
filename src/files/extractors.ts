import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chunkText } from "./chunker.js";
import { detectFileType } from "./typeDetect.js";
import { redactSecrets } from "../security/redaction.js";
import type { FileUnderstanding, UnderstandingStatus } from "../types.js";

export interface ReadUnderstandingOptions {
  rootId: string;
  absolutePath: string;
  relativePath: string;
  maxChars?: number;
  startLine?: number;
  numLines?: number;
}

export function understandFile(options: ReadUnderstandingOptions): FileUnderstanding {
  const stat = fs.statSync(options.absolutePath);
  const type = detectFileType(options.absolutePath);
  const hash = sha256FilePrefix(options.absolutePath);
  if (type.kind === "text") {
    const raw = fs.readFileSync(options.absolutePath, "utf8");
    const redacted = redactSecrets(raw);
    const chunked = chunkText({
      path: options.relativePath,
      text: redacted,
      maxChars: options.maxChars,
      startLine: options.startLine,
      numLines: options.numLines
    });
    return {
      ok: true,
      root_id: options.rootId,
      path: options.relativePath,
      file_type: "text",
      understanding_status: chunked.truncated ? "partial" : "complete",
      size: stat.size,
      hash,
      redacted: raw !== redacted,
      truncated: chunked.truncated,
      coverage_warning: chunked.truncated ? "Only part of this file was returned. Do not claim the whole file was read." : null,
      chunks: chunked.chunks,
      metadata: { mime: type.mime, extension: type.extension, line_range_returned: chunked.lineRange },
      next_actions: chunked.truncated ? ["Call read_file_chunk with a narrower line range for more detail."] : []
    };
  }

  const metadata = binaryMetadata(options.absolutePath, type.kind, type.mime);
  const status: UnderstandingStatus = type.kind === "unknown" ? "unsupported_extractor" : "metadata_only";
  const explanation = [
    `File ${options.relativePath}`,
    `Type: ${type.kind}`,
    `MIME: ${type.mime}`,
    `Size: ${stat.size} bytes`,
    `SHA256 prefix hash: ${hash}`,
    `V1 returned metadata because deep extraction for this file type is not enabled yet.`
  ].join("\n");
  const chunked = chunkText({ path: options.relativePath, text: explanation, maxChars: options.maxChars ?? 4000 });
  return {
    ok: true,
    root_id: options.rootId,
    path: options.relativePath,
    file_type: type.kind,
    understanding_status: status,
    size: stat.size,
    hash,
    redacted: false,
    truncated: false,
    coverage_warning: "Metadata-only understanding. Claude should not infer unseen binary contents.",
    chunks: chunked.chunks,
    metadata: { ...metadata, mime: type.mime, extension: type.extension },
    next_actions: ["Add or enable a typed extractor for deeper understanding of this file type."]
  };
}

function sha256FilePrefix(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
    hash.update(buffer.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function binaryMetadata(filePath: string, kind: string, mime: string): Record<string, unknown> {
  if (kind === "image") {
    return imageMetadata(filePath);
  }
  if (kind === "archive" || kind === "office") {
    return { container: "zip-like", safe_default: "entries are not extracted by default" };
  }
  if (kind === "pdf") {
    return { container: "pdf", text_layer_extraction: "not_enabled_in_v1" };
  }
  if (kind === "database") {
    return { container: "database", content_read: "blocked_without_explicit_extractor" };
  }
  return { mime, extension: path.extname(filePath).toLowerCase() };
}

function imageMetadata(filePath: string): Record<string, unknown> {
  const buffer = fs.readFileSync(filePath).subarray(0, 64);
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: "png" };
  }
  return { format: path.extname(filePath).replace(".", "").toLowerCase() || "image" };
}
