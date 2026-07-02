export type RootRemoteReadPolicy = "disabled" | "restricted" | "same_as_desktop";
export type SensitiveReadPolicy = "confirm" | "redacted" | "allow";

export interface RootPolicy {
  read: boolean;
  remote_read: RootRemoteReadPolicy;
  sensitive_read: SensitiveReadPolicy;
  write: false;
}

export interface RootRecord {
  root_id: string;
  name: string;
  root_hint: string;
  absolute_path_local_only: string;
  created_at: string;
  last_seen: string;
  policy: RootPolicy;
  removed?: boolean;
}

export type RootTier = "tiny" | "small" | "medium" | "large" | "huge";

export interface RootInspection {
  ok: true;
  root_id: string;
  root_hint: string;
  files_estimate: number;
  folders_estimate: number;
  returned_entries: number;
  truncated: boolean;
  tier: RootTier;
  strategy: string;
  ignored_dirs: string[];
  sample_entries: FileEntry[];
  coverage_warning: string | null;
}

export interface FileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
  mtime_ms?: number;
  extension?: string;
}

export type FileKind = "text" | "pdf" | "office" | "image" | "archive" | "database" | "binary" | "unknown";
export type UnderstandingStatus =
  | "complete"
  | "partial"
  | "metadata_only"
  | "blocked_confirmation_required"
  | "unsupported_extractor";

export interface FileChunk {
  chunk_id: string;
  citation: string;
  start_line?: number;
  end_line?: number;
  text: string;
  bytes: number;
}

export interface FileUnderstanding {
  ok: true;
  root_id: string;
  path: string;
  file_type: FileKind;
  understanding_status: UnderstandingStatus;
  size: number;
  hash: string;
  redacted: boolean;
  truncated: boolean;
  coverage_warning: string | null;
  chunks: FileChunk[];
  metadata: Record<string, unknown>;
  next_actions: string[];
}

export interface ContextPacket {
  ok: true;
  packet_id: string;
  created_at: string;
  root_id: string;
  query: string | null;
  budget: number;
  used_chars: number;
  files_requested: string[];
  files_read: string[];
  files_skipped: Array<{ path: string; reason: string }>;
  citations: string[];
  content: string;
  coverage_warning: string | null;
}

export interface LedgerEvent<T = Record<string, unknown>> {
  id: string;
  type: string;
  created_at: string;
  payload: T;
}
