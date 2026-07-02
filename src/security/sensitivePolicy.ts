import path from "node:path";

const SENSITIVE_BASENAMES = new Set([
  ".env",
  "local_token",
  "id_rsa",
  "id_ed25519",
  "cookies",
  "cookies.sqlite",
  "login data",
  "web data"
]);

const SENSITIVE_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx", ".sqlite", ".db", ".kdbx"]);

export function isSensitiveRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  const basename = path.posix.basename(normalized);
  if (SENSITIVE_BASENAMES.has(basename) || basename.startsWith(".env.")) {
    return true;
  }
  if (normalized.includes("/browser/") || normalized.includes("/chrome/") || normalized.includes("/edge/")) {
    return true;
  }
  return SENSITIVE_EXTENSIONS.has(path.posix.extname(basename));
}

export function sensitiveBlockReason(relativePath: string): string {
  return `Sensitive file policy requires explicit local confirmation before reading ${relativePath}.`;
}
