import fs from "node:fs";
import path from "node:path";
import type { RootPolicy } from "../types.js";

export const defaultRootPolicy: RootPolicy = {
  read: true,
  remote_read: "restricted",
  sensitive_read: "confirm",
  write: false
};

export function validateRootPath(rootInput: string): string {
  const resolved = path.resolve(rootInput);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Root does not exist: ${rootInput}`);
  }
  const real = fs.realpathSync(resolved);
  const stat = fs.statSync(real);
  if (!stat.isDirectory()) {
    throw new Error(`Root is not a directory: ${rootInput}`);
  }
  if (isDangerousRoot(real)) {
    throw new Error(`Refusing unsafe root: ${real}`);
  }
  fs.accessSync(real, fs.constants.R_OK);
  return real;
}

export function validateRootId(idInput: string): string {
  const id = idInput.trim();
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(id) || id.includes("..")) {
    throw new Error("Root id must match ^[A-Za-z0-9._-]{1,80}$ and must not contain traversal.");
  }
  return id;
}

function isDangerousRoot(root: string): boolean {
  const parsed = path.parse(root);
  if (root.toLowerCase() === parsed.root.toLowerCase()) {
    return true;
  }
  const lower = root.toLowerCase();
  const systemRoots = [process.env.SystemRoot, process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]
    .filter((item): item is string => Boolean(item))
    .map((item) => path.resolve(item).toLowerCase());
  if (systemRoots.some((item) => lower === item || lower.startsWith(`${item}${path.sep}`))) {
    return true;
  }
  const appData = [process.env.APPDATA, process.env.LOCALAPPDATA]
    .filter((item): item is string => Boolean(item))
    .map((item) => path.resolve(item).toLowerCase());
  return appData.some((item) => lower === item);
}
