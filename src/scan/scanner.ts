import fs from "node:fs";
import path from "node:path";
import { appendLedgerEvent } from "../ledger/jsonlStore.js";
import { toPosixPath } from "../paths.js";
import type { FileEntry } from "../types.js";
import { IGNORED_DIRS } from "./inspector.js";
import { IndexStore } from "./indexStore.js";

export function scanRoot(rootId: string, rootPath: string, options: { maxEntries?: number; maxDepth?: number } = {}) {
  const maxEntries = options.maxEntries ?? 50000;
  const maxDepth = options.maxDepth ?? 12;
  const entries: FileEntry[] = [];
  let files = 0;
  let folders = 0;
  let truncated = false;
  const queue: Array<{ absolutePath: string; relativePath: string; depth: number }> = [
    { absolutePath: rootPath, relativePath: "", depth: 0 }
  ];
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) {
      continue;
    }
    let children: fs.Dirent[];
    try {
      children = fs.readdirSync(current.absolutePath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      if (child.isSymbolicLink() || IGNORED_DIRS.has(child.name)) {
        continue;
      }
      const childRelative = toPosixPath(path.join(current.relativePath, child.name));
      const childAbsolute = path.join(current.absolutePath, child.name);
      if (child.isDirectory()) {
        folders += 1;
        const entry: FileEntry = { path: childRelative, type: "directory" };
        push(entries, entry, maxEntries);
        queue.push({ absolutePath: childAbsolute, relativePath: childRelative, depth: current.depth + 1 });
      } else if (child.isFile()) {
        files += 1;
        const stat = fs.statSync(childAbsolute);
        push(
          entries,
          {
            path: childRelative,
            type: "file",
            size: stat.size,
            mtime_ms: stat.mtimeMs,
            extension: path.extname(child.name).toLowerCase()
          },
          maxEntries
        );
      }
      if (entries.length >= maxEntries) {
        truncated = true;
      }
    }
  }
  const index = new IndexStore(rootId);
  index.upsertEntries(entries);
  const result = {
    ok: true,
    root_id: rootId,
    files_seen: files,
    folders_seen: folders,
    indexed_entries: entries.length,
    truncated,
    index_available: index.available(),
    coverage_warning: truncated ? "Scan was truncated. Increase max_entries or narrow the root." : null
  };
  index.close();
  appendLedgerEvent("inventory", "root_scanned", result);
  return result;
}

function push(entries: FileEntry[], entry: FileEntry, maxEntries: number): void {
  if (entries.length < maxEntries) {
    entries.push(entry);
  }
}
