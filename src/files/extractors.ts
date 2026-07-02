import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { chunkText } from "./chunker.js";
import { detectFileType } from "./typeDetect.js";
import { redactSecrets } from "../security/redaction.js";
import type { FileKind, FileUnderstanding, UnderstandingStatus } from "../types.js";

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
    return textUnderstanding({
      rootId: options.rootId,
      relativePath: options.relativePath,
      kind: "text",
      size: stat.size,
      hash,
      mime: type.mime,
      extension: type.extension,
      rawText: fs.readFileSync(options.absolutePath, "utf8"),
      maxChars: options.maxChars,
      startLine: options.startLine,
      numLines: options.numLines
    });
  }

  if (type.kind === "office") {
    const extracted = extractOfficeText(options.absolutePath);
    if (extracted.text.trim()) {
      return textUnderstanding({
        rootId: options.rootId,
        relativePath: options.relativePath,
        kind: "office",
        size: stat.size,
        hash,
        mime: type.mime,
        extension: type.extension,
        rawText: extracted.text,
        maxChars: options.maxChars,
        metadata: { extractor: "openxml-basic", parts: extracted.parts }
      });
    }
  }

  if (type.kind === "archive") {
    const archive = listArchiveEntries(options.absolutePath);
    const explanation = [
      `Archive ${options.relativePath}`,
      `Entries returned: ${archive.entries.length}`,
      `Truncated: ${archive.truncated ? "yes" : "no"}`,
      "",
      ...archive.entries.map((entry) => `${entry.directory ? "dir " : "file"} ${entry.name}${entry.size !== undefined ? ` (${entry.size} bytes)` : ""}`)
    ].join("\n");
    const chunked = chunkText({ path: options.relativePath, text: explanation, maxChars: options.maxChars ?? 12000 });
    return {
      ok: true,
      root_id: options.rootId,
      path: options.relativePath,
      file_type: "archive",
      understanding_status: archive.truncated || chunked.truncated ? "partial" : "complete",
      size: stat.size,
      hash,
      redacted: false,
      truncated: archive.truncated || chunked.truncated,
      coverage_warning: archive.truncated ? "Archive entry list was truncated. Contents were not extracted by default." : null,
      chunks: chunked.chunks,
      metadata: { mime: type.mime, extension: type.extension, entries_returned: archive.entries.length },
      next_actions: ["Read a specific extracted text file separately after unpacking outside MCP, or add an archive member extractor."]
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
    return { container: "zip-like", safe_default: "metadata returned because no text-bearing parts were found" };
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

function textUnderstanding(input: {
  rootId: string;
  relativePath: string;
  kind: FileKind;
  size: number;
  hash: string;
  mime: string;
  extension: string;
  rawText: string;
  maxChars?: number;
  startLine?: number;
  numLines?: number;
  metadata?: Record<string, unknown>;
}): FileUnderstanding {
  const redacted = redactSecrets(input.rawText);
  const chunked = chunkText({
    path: input.relativePath,
    text: redacted,
    maxChars: input.maxChars,
    startLine: input.startLine,
    numLines: input.numLines
  });
  return {
    ok: true,
    root_id: input.rootId,
    path: input.relativePath,
    file_type: input.kind,
    understanding_status: chunked.truncated ? "partial" : "complete",
    size: input.size,
    hash: input.hash,
    redacted: input.rawText !== redacted,
    truncated: chunked.truncated,
    coverage_warning: chunked.truncated ? "Only part of this file was returned. Do not claim the whole file was read." : null,
    chunks: chunked.chunks,
    metadata: { mime: input.mime, extension: input.extension, line_range_returned: chunked.lineRange, ...input.metadata },
    next_actions: chunked.truncated ? ["Call read_file_chunk with a narrower line range for more detail."] : []
  };
}

function extractOfficeText(filePath: string): { text: string; parts: string[] } {
  const extension = path.extname(filePath).toLowerCase();
  const zip = new AdmZip(filePath);
  const parts: string[] = [];
  const textParts: string[] = [];
  if (extension === ".docx") {
    for (const name of ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"]) {
      appendXmlText(zip, name, parts, textParts);
    }
  } else if (extension === ".pptx") {
    for (const entry of zip.getEntries().filter((item) => /^ppt\/slides\/slide\d+\.xml$/i.test(item.entryName))) {
      appendXmlText(zip, entry.entryName, parts, textParts);
    }
  } else if (extension === ".xlsx") {
    appendXmlText(zip, "xl/sharedStrings.xml", parts, textParts);
    for (const entry of zip.getEntries().filter((item) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(item.entryName))) {
      appendXmlText(zip, entry.entryName, parts, textParts);
    }
  }
  return { text: textParts.join("\n\n"), parts };
}

function appendXmlText(zip: AdmZip, entryName: string, parts: string[], textParts: string[]): void {
  const entry = zip.getEntry(entryName);
  if (!entry || entry.isDirectory) {
    return;
  }
  const xml = entry.getData().toString("utf8");
  const text = xmlText(xml);
  if (text.trim()) {
    parts.push(entryName);
    textParts.push(`# ${entryName}\n${text}`);
  }
}

function xmlText(xml: string): string {
  return xml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/(w:p|a:p|row)>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function listArchiveEntries(filePath: string, maxEntries = 100): { entries: Array<{ name: string; directory: boolean; size?: number }>; truncated: boolean } {
  const zip = new AdmZip(filePath);
  const all = zip.getEntries();
  return {
    entries: all.slice(0, maxEntries).map((entry) => ({
      name: entry.entryName,
      directory: entry.isDirectory,
      size: entry.isDirectory ? undefined : entry.header.size
    })),
    truncated: all.length > maxEntries
  };
}
