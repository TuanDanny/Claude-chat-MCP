import os from "node:os";
import path from "node:path";
import { ensureDir } from "./fsx.js";

export function defaultStateDir(): string {
  return process.env.CLAUDE_LOCAL_MCP_HOME
    ? path.resolve(process.env.CLAUDE_LOCAL_MCP_HOME)
    : path.join(process.env.LOCALAPPDATA ?? os.homedir(), "ClaudeLocalMCP");
}

export function statePath(...segments: string[]): string {
  const root = defaultStateDir();
  ensureDir(root);
  return path.join(root, ...segments);
}

export function ledgerPath(name: string): string {
  return statePath(`${name}.jsonl`);
}

export function indexPath(rootId: string): string {
  return statePath("index", `${rootId}.sqlite`);
}

export function toPosixPath(input: string): string {
  return input.split(path.sep).join("/");
}

export function rootHint(root: string): string {
  const parsed = path.parse(path.resolve(root));
  const base = path.basename(root) || root;
  return path.join(parsed.root, "...", base);
}
