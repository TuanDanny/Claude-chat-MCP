import fs from "node:fs";
import path from "node:path";
import type { FileKind } from "../types.js";

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".mdx",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".csv",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".php",
  ".rb",
  ".sh",
  ".ps1",
  ".bat",
  ".html",
  ".css",
  ".scss",
  ".xml",
  ".sql"
]);

const OFFICE_EXTENSIONS = new Set([".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp"]);
const ARCHIVE_EXTENSIONS = new Set([".zip", ".7z", ".rar", ".tar", ".gz"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"]);
const DATABASE_EXTENSIONS = new Set([".sqlite", ".db"]);

export interface DetectedFileType {
  kind: FileKind;
  mime: string;
  extension: string;
  is_utf8_text: boolean;
}

export function detectFileType(filePath: string): DetectedFileType {
  const extension = path.extname(filePath).toLowerCase();
  const header = readHeader(filePath);
  const isUtf8 = isUtf8Text(header);
  if (TEXT_EXTENSIONS.has(extension) || isUtf8) {
    return { kind: "text", mime: textMime(extension), extension, is_utf8_text: true };
  }
  if (extension === ".pdf" || header.subarray(0, 4).toString("ascii") === "%PDF") {
    return { kind: "pdf", mime: "application/pdf", extension, is_utf8_text: false };
  }
  if (OFFICE_EXTENSIONS.has(extension)) {
    return { kind: "office", mime: officeMime(extension), extension, is_utf8_text: false };
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return { kind: "image", mime: imageMime(extension), extension, is_utf8_text: false };
  }
  if (ARCHIVE_EXTENSIONS.has(extension)) {
    return { kind: "archive", mime: "application/zip", extension, is_utf8_text: false };
  }
  if (DATABASE_EXTENSIONS.has(extension)) {
    return { kind: "database", mime: "application/octet-stream", extension, is_utf8_text: false };
  }
  return { kind: header.includes(0) ? "binary" : "unknown", mime: "application/octet-stream", extension, is_utf8_text: false };
}

function readHeader(filePath: string): Buffer {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(8192);
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

function isUtf8Text(buffer: Buffer): boolean {
  if (buffer.includes(0)) {
    return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function textMime(extension: string): string {
  if (extension === ".json" || extension === ".jsonl") return "application/json";
  if (extension === ".md" || extension === ".mdx") return "text/markdown";
  if (extension === ".html") return "text/html";
  if (extension === ".css" || extension === ".scss") return "text/css";
  return "text/plain";
}

function imageMime(extension: string): string {
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  return "image/*";
}

function officeMime(extension: string): string {
  if (extension === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}
