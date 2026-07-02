import fs from "node:fs";
import path from "node:path";
import { appendLedgerEvent } from "./ledger/jsonlStore.js";
import { publicRootView, requireRoot, listRoots } from "./roots/registry.js";
import { isSensitiveRelativePath, sensitiveBlockReason } from "./security/sensitivePolicy.js";
import { audit } from "./security/audit.js";
import { redactSecrets } from "./security/redaction.js";
import { resolveSafePath } from "./files/safePath.js";
import { understandFile } from "./files/extractors.js";
import { buildContextPacket, resumeContext } from "./files/contextPacket.js";
import { detectFileType } from "./files/typeDetect.js";
import { inspectRoot } from "./scan/inspector.js";
import { scanRoot as runScanRoot } from "./scan/scanner.js";
import { IndexStore } from "./scan/indexStore.js";
import { toPosixPath } from "./paths.js";
import type { FileEntry, FileUnderstanding } from "./types.js";

export function listPublicRoots() {
  return { ok: true, roots: listRoots().map(publicRootView) };
}

export function inspectRegisteredRoot(rootId: string, options: { maxEntries?: number; maxDepth?: number } = {}) {
  const root = requireRoot(rootId);
  return inspectRoot(root.root_id, root.absolute_path_local_only, options);
}

export function scanRegisteredRoot(rootId: string, options: { maxEntries?: number; maxDepth?: number } = {}) {
  const root = requireRoot(rootId);
  return runScanRoot(root.root_id, root.absolute_path_local_only, options);
}

export function searchFiles(rootId: string, query: string, options: { maxResults?: number; maxDepth?: number } = {}) {
  const root = requireRoot(rootId);
  const cleanQuery = requireQuery(query);
  const index = new IndexStore(root.root_id);
  let matches = index.searchFiles(cleanQuery, options.maxResults ?? 50);
  const indexAvailable = index.available();
  index.close();
  if (!matches.length) {
    matches = liveFileSearch(root.absolute_path_local_only, cleanQuery, options.maxResults ?? 50, options.maxDepth ?? 8);
  }
  const result = { ok: true, root_id: root.root_id, query: cleanQuery, index_available: indexAvailable, matches, truncated: matches.length >= (options.maxResults ?? 50) };
  appendLedgerEvent("reads", "file_search", result);
  return result;
}

export function searchContent(
  rootId: string,
  query: string,
  options: { maxMatches?: number; maxFileSize?: number; maxDepth?: number; confirmSensitive?: boolean } = {}
) {
  const root = requireRoot(rootId);
  const cleanQuery = requireQuery(query);
  const maxMatches = options.maxMatches ?? 50;
  const maxFileSize = options.maxFileSize ?? 200000;
  const matches: Array<{ path: string; line: number; snippet: string }> = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  walk(root.absolute_path_local_only, options.maxDepth ?? 8, (entry, absolutePath) => {
    if (entry.type !== "file") return true;
    if (isSensitiveRelativePath(entry.path) && !options.confirmSensitive) {
      skipped.push({ path: entry.path, reason: "sensitive_file_policy" });
      return true;
    }
    const stat = fs.statSync(absolutePath);
    if (stat.size > maxFileSize) {
      skipped.push({ path: entry.path, reason: "file_too_large_for_content_search" });
      return true;
    }
    if (detectFileType(absolutePath).kind !== "text") {
      return true;
    }
    const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].toLowerCase().includes(cleanQuery.toLowerCase())) {
        continue;
      }
      if (matches.length >= maxMatches) {
        return false;
      }
      matches.push({ path: entry.path, line: index + 1, snippet: redactSecrets(lines[index].slice(0, 500)) });
    }
    return true;
  });
  const result = { ok: true, root_id: root.root_id, query: cleanQuery, matches, skipped, truncated: matches.length >= maxMatches, redacted: true };
  appendLedgerEvent("reads", "content_search", result);
  return result;
}

export function readRegisteredFile(
  rootId: string,
  relativePath: string,
  options: { maxChars?: number; startLine?: number; numLines?: number; confirmSensitive?: boolean; remote?: boolean } = {}
): FileUnderstanding {
  const root = requireRoot(rootId);
  const safe = resolveSafePath(root.absolute_path_local_only, relativePath);
  const stat = fs.statSync(safe.absolutePath);
  if (isSensitiveRelativePath(safe.relativePath) && !options.confirmSensitive) {
    const blocked: FileUnderstanding = {
      ok: true,
      root_id: root.root_id,
      path: safe.relativePath,
      file_type: "unknown",
      understanding_status: "blocked_confirmation_required",
      size: stat.size,
      hash: "blocked_until_confirmed",
      redacted: false,
      truncated: false,
      coverage_warning: sensitiveBlockReason(safe.relativePath),
      chunks: [],
      metadata: { policy: "sensitive_read_requires_confirmation", remote: Boolean(options.remote) },
      next_actions: ["Confirm this exact file locally before reading its contents."]
    };
    appendLedgerEvent("reads", "file_read_blocked", blocked as unknown as Record<string, unknown>);
    audit("sensitive_file_blocked", { root_id: root.root_id, path: safe.relativePath, remote: Boolean(options.remote) });
    return blocked;
  }
  const understanding = understandFile({
    rootId: root.root_id,
    absolutePath: safe.absolutePath,
    relativePath: safe.relativePath,
    maxChars: options.maxChars,
    startLine: options.startLine,
    numLines: options.numLines
  });
  appendLedgerEvent("reads", "file_read", understanding as unknown as Record<string, unknown>);
  for (const chunk of understanding.chunks) {
    appendLedgerEvent("chunks", "chunk_created", {
      root_id: root.root_id,
      path: understanding.path,
      chunk_id: chunk.chunk_id,
      citation: chunk.citation,
      bytes: chunk.bytes,
      file_hash: understanding.hash
    });
  }
  audit("file_read", { root_id: root.root_id, path: safe.relativePath, status: understanding.understanding_status, remote: Boolean(options.remote) });
  return understanding;
}

export function buildPacketFromFiles(
  rootId: string,
  files: string[],
  options: { query?: string; budget?: number; maxCharsPerFile?: number; confirmSensitive?: boolean; remote?: boolean } = {}
) {
  const understandings: FileUnderstanding[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  for (const file of files) {
    try {
      const understanding = readRegisteredFile(rootId, file, {
        maxChars: options.maxCharsPerFile ?? 12000,
        confirmSensitive: options.confirmSensitive,
        remote: options.remote
      });
      if (understanding.understanding_status === "blocked_confirmation_required") {
        skipped.push({ path: file, reason: "sensitive_confirmation_required" });
      } else {
        understandings.push(understanding);
      }
    } catch (error) {
      skipped.push({ path: file, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return buildContextPacket({
    rootId,
    query: options.query,
    budget: options.budget,
    filesRequested: files,
    understandings,
    skipped
  });
}

export { resumeContext };

function requireQuery(query: string): string {
  const clean = query.trim();
  if (!clean) {
    throw new Error("Query is required.");
  }
  return clean;
}

function liveFileSearch(rootPath: string, query: string, maxResults: number, maxDepth: number): FileEntry[] {
  const matches: FileEntry[] = [];
  walk(rootPath, maxDepth, (entry) => {
    if (entry.path.toLowerCase().includes(query.toLowerCase())) {
      matches.push(entry);
    }
    return matches.length < maxResults;
  });
  return matches;
}

function walk(rootPath: string, maxDepth: number, onEntry: (entry: FileEntry, absolutePath: string) => boolean): void {
  const queue: Array<{ absolutePath: string; relativePath: string; depth: number }> = [{ absolutePath: rootPath, relativePath: "", depth: 0 }];
  const ignored = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".cache", "target"]);
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) continue;
    let children: fs.Dirent[];
    try {
      children = fs.readdirSync(current.absolutePath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      if (child.isSymbolicLink() || ignored.has(child.name)) continue;
      const childRelative = toPosixPath(path.join(current.relativePath, child.name));
      const childAbsolute = path.join(current.absolutePath, child.name);
      const stat = fs.statSync(childAbsolute);
      const entry: FileEntry = {
        path: childRelative,
        type: child.isDirectory() ? "directory" : "file",
        ...(child.isFile() ? { size: stat.size, mtime_ms: stat.mtimeMs, extension: path.extname(child.name).toLowerCase() } : {})
      };
      if (!onEntry(entry, childAbsolute)) return;
      if (child.isDirectory()) {
        queue.push({ absolutePath: childAbsolute, relativePath: childRelative, depth: current.depth + 1 });
      }
    }
  }
}
