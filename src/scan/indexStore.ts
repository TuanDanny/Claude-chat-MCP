import { createRequire } from "node:module";
import path from "node:path";
import { ensureDir } from "../fsx.js";
import { indexPath } from "../paths.js";
import type { FileEntry } from "../types.js";

const require = createRequire(import.meta.url);

interface SqliteModule {
  DatabaseSync: new (filePath: string) => SqliteDb;
}

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...values: unknown[]): void;
    all(...values: unknown[]): unknown[];
    get(...values: unknown[]): unknown;
  };
  close(): void;
}

export class IndexStore {
  private db: SqliteDb | undefined;

  constructor(private readonly rootId: string) {
    const sqlite = loadSqlite();
    if (!sqlite) {
      return;
    }
    const dbPath = indexPath(rootId);
    ensureDir(path.dirname(dbPath));
    this.db = new sqlite.DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        root_id TEXT NOT NULL,
        path TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER,
        mtime_ms REAL,
        extension TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(root_id, path)
      );
      CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
      CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
    `);
  }

  available(): boolean {
    return Boolean(this.db);
  }

  upsertEntries(entries: FileEntry[]): void {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      INSERT INTO files(root_id, path, type, size, mtime_ms, extension, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(root_id, path) DO UPDATE SET
        type=excluded.type,
        size=excluded.size,
        mtime_ms=excluded.mtime_ms,
        extension=excluded.extension,
        updated_at=excluded.updated_at
    `);
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      for (const entry of entries) {
        stmt.run(this.rootId, entry.path, entry.type, entry.size ?? null, entry.mtime_ms ?? null, entry.extension ?? null, now);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  searchFiles(query: string, maxResults = 50): FileEntry[] {
    if (!this.db) return [];
    const rows = this.db.prepare("SELECT path, type, size, mtime_ms, extension FROM files WHERE path LIKE ? ORDER BY path LIMIT ?").all(
      `%${query.replace(/[%_]/g, "")}%`,
      maxResults
    ) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      path: String(row.path),
      type: row.type === "directory" ? "directory" : "file",
      size: typeof row.size === "number" ? row.size : undefined,
      mtime_ms: typeof row.mtime_ms === "number" ? row.mtime_ms : undefined,
      extension: typeof row.extension === "string" ? row.extension : undefined
    }));
  }

  close(): void {
    this.db?.close();
  }
}

function loadSqlite(): SqliteModule | undefined {
  try {
    return require("node:sqlite") as SqliteModule;
  } catch {
    return undefined;
  }
}
