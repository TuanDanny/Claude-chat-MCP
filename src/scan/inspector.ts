import fs from "node:fs";
import path from "node:path";
import { rootHint, toPosixPath } from "../paths.js";
import type { FileEntry, RootInspection, RootTier } from "../types.js";

export const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".cache",
  ".turbo",
  "target",
  ".venv",
  "__pycache__"
]);

export function inspectRoot(rootId: string, rootPath: string, options: { maxEntries?: number; maxDepth?: number } = {}): RootInspection {
  const maxEntries = options.maxEntries ?? 6000;
  const maxDepth = options.maxDepth ?? 6;
  const sample: FileEntry[] = [];
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
      if (child.isSymbolicLink() || child.name.startsWith(".") && child.name !== ".github") {
        continue;
      }
      if (child.isDirectory() && IGNORED_DIRS.has(child.name)) {
        continue;
      }
      const childRelative = toPosixPath(path.join(current.relativePath, child.name));
      const childAbsolute = path.join(current.absolutePath, child.name);
      if (child.isDirectory()) {
        folders += 1;
        pushSample(sample, { path: childRelative, type: "directory" }, maxEntries);
        queue.push({ absolutePath: childAbsolute, relativePath: childRelative, depth: current.depth + 1 });
      } else if (child.isFile()) {
        files += 1;
        const stat = safeStat(childAbsolute);
        pushSample(
          sample,
          {
            path: childRelative,
            type: "file",
            size: stat?.size,
            mtime_ms: stat?.mtimeMs,
            extension: path.extname(child.name).toLowerCase()
          },
          maxEntries
        );
      }
      if (sample.length >= maxEntries) {
        truncated = true;
      }
    }
  }

  const tier = tierFor(files + folders);
  return {
    ok: true,
    root_id: rootId,
    root_hint: rootHint(rootPath),
    files_estimate: files,
    folders_estimate: folders,
    returned_entries: sample.length,
    truncated,
    tier,
    strategy: strategyFor(tier),
    ignored_dirs: [...IGNORED_DIRS].sort(),
    sample_entries: sample,
    coverage_warning: truncated ? "Inventory was truncated. Use scan_root/search tools before claiming full awareness." : null
  };
}

export function tierFor(entries: number): RootTier {
  if (entries <= 500) return "tiny";
  if (entries <= 3000) return "small";
  if (entries <= 50000) return "medium";
  if (entries <= 250000) return "large";
  return "huge";
}

export function strategyFor(tier: RootTier): string {
  switch (tier) {
    case "tiny":
      return "Live tree plus direct reads of important files.";
    case "small":
      return "Full inventory, priority reads, and compact context packets.";
    case "medium":
      return "Background scan, metadata index, search-first reading.";
    case "large":
      return "Shard by top-level folders, incremental scan, and task-scoped packets.";
    case "huge":
      return "Partitioned index, mandatory search/filter, strict coverage reporting.";
  }
}

function pushSample(sample: FileEntry[], entry: FileEntry, maxEntries: number): void {
  if (sample.length < maxEntries) {
    sample.push(entry);
  }
}

function safeStat(filePath: string): fs.Stats | undefined {
  try {
    return fs.statSync(filePath);
  } catch {
    return undefined;
  }
}
