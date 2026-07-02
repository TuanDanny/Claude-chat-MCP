import fs from "node:fs";
import path from "node:path";
import { toPosixPath } from "../paths.js";

export class SafePathError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SafePathError";
    this.code = code;
  }
}

export function normalizeRelativePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new SafePathError("invalid_path", "Path is required.");
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed) || path.isAbsolute(trimmed) || trimmed.includes(":")) {
    throw new SafePathError("invalid_path", "Path must be root-relative, not absolute, URL, or drive-qualified.");
  }
  const parts = trimmed.split(/[\\/]+/);
  if (parts.some((part) => part === "" || part === "..")) {
    throw new SafePathError("invalid_path", "Path must not contain traversal or empty segments.");
  }
  return toPosixPath(path.normalize(parts.join(path.sep)));
}

export function resolveSafePath(root: string, relativePathInput: string): { absolutePath: string; relativePath: string } {
  const realRoot = fs.realpathSync(root);
  const relativePath = normalizeRelativePath(relativePathInput);
  const candidate = path.resolve(realRoot, relativePath);
  if (!fs.existsSync(candidate)) {
    throw new SafePathError("not_found", "Requested path does not exist.");
  }
  const realCandidate = fs.realpathSync(candidate);
  const relative = path.relative(realRoot, realCandidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SafePathError("path_outside_root", "Requested path is outside the allowed root.");
  }
  return { absolutePath: realCandidate, relativePath };
}
