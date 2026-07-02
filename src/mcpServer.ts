import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import {
  buildPacketFromFiles,
  inspectRegisteredRoot,
  listPublicRoots,
  readRegisteredFile,
  resumeContext,
  scanRegisteredRoot,
  searchContent,
  searchFiles
} from "./core.js";
import { auditSummary } from "./security/audit.js";

function textResult(text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structuredContent ? { structuredContent } : {})
  };
}

function jsonResult(value: Record<string, unknown>) {
  return textResult(JSON.stringify(value, null, 2), value);
}

export function createClaudeLocalMcpServer(): McpServer {
  const server = new McpServer({
    name: "claude-local-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "list_roots",
    {
      title: "List Allowed Local Roots",
      description: "List root folders explicitly allowlisted for Claude. Raw absolute paths are hidden from Claude by default.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async () => jsonResult(listPublicRoots())
  );

  server.registerTool(
    "inspect_root",
    {
      title: "Inspect Root Scale And Strategy",
      description: "Estimate root size, classify scale tier, and return the safest reading strategy before browsing a local root.",
      inputSchema: {
        root_id: z.string(),
        max_entries: z.number().int().min(1).max(10000).optional(),
        max_depth: z.number().int().min(1).max(20).optional()
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ root_id, max_entries, max_depth }) =>
      jsonResult(inspectRegisteredRoot(root_id, { maxEntries: max_entries, maxDepth: max_depth }) as unknown as Record<string, unknown>)
  );

  server.registerTool(
    "scan_root",
    {
      title: "Scan Root Into Local Ledger And Index",
      description: "Incrementally scan an allowlisted root, append inventory JSONL events, and update the local SQLite metadata index.",
      inputSchema: {
        root_id: z.string(),
        max_entries: z.number().int().min(1).max(1000000).default(50000),
        max_depth: z.number().int().min(1).max(40).default(12)
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async ({ root_id, max_entries, max_depth }) =>
      jsonResult(scanRegisteredRoot(root_id, { maxEntries: max_entries, maxDepth: max_depth }) as unknown as Record<string, unknown>)
  );

  server.registerTool(
    "search_files",
    {
      title: "Search Files By Path",
      description: "Search allowlisted local root paths by name/path using the local index when available, with live fallback.",
      inputSchema: {
        root_id: z.string(),
        query: z.string(),
        max_results: z.number().int().min(1).max(500).default(50),
        max_depth: z.number().int().min(1).max(30).default(8)
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ root_id, query, max_results, max_depth }) =>
      jsonResult(searchFiles(root_id, query, { maxResults: max_results, maxDepth: max_depth }) as unknown as Record<string, unknown>)
  );

  server.registerTool(
    "search_content",
    {
      title: "Search Text Content",
      description: "Search text content in allowlisted roots with bounded file size, redacted snippets, and sensitive-file blocking.",
      inputSchema: {
        root_id: z.string(),
        query: z.string(),
        max_matches: z.number().int().min(1).max(500).default(50),
        max_file_size: z.number().int().min(1).max(1000000).default(200000),
        max_depth: z.number().int().min(1).max(30).default(8),
        confirm_sensitive: z.boolean().default(false)
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ root_id, query, max_matches, max_file_size, max_depth, confirm_sensitive }) =>
      jsonResult(
        searchContent(root_id, query, {
          maxMatches: max_matches,
          maxFileSize: max_file_size,
          maxDepth: max_depth,
          confirmSensitive: confirm_sensitive
        }) as unknown as Record<string, unknown>
      )
  );

  server.registerTool(
    "read_file",
    {
      title: "Read And Understand File",
      description: "Read a root-relative file through safe path checks, sensitive policy, type detection, extraction, chunking, and citations.",
      inputSchema: {
        root_id: z.string(),
        path: z.string(),
        max_chars: z.number().int().min(1).max(200000).default(12000),
        start_line: z.number().int().min(1).optional(),
        num_lines: z.number().int().min(1).max(100000).optional(),
        confirm_sensitive: z.boolean().default(false)
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ root_id, path, max_chars, start_line, num_lines, confirm_sensitive }) =>
      jsonResult(
        readRegisteredFile(root_id, path, {
          maxChars: max_chars,
          startLine: start_line,
          numLines: num_lines,
          confirmSensitive: confirm_sensitive
        }) as unknown as Record<string, unknown>
      )
  );

  server.registerTool(
    "read_file_chunk",
    {
      title: "Read File Chunk",
      description: "Read a narrower line-window chunk from a root-relative file.",
      inputSchema: {
        root_id: z.string(),
        path: z.string(),
        start_line: z.number().int().min(1),
        num_lines: z.number().int().min(1).max(100000),
        max_chars: z.number().int().min(1).max(200000).default(12000),
        confirm_sensitive: z.boolean().default(false)
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ root_id, path, start_line, num_lines, max_chars, confirm_sensitive }) =>
      jsonResult(
        readRegisteredFile(root_id, path, {
          startLine: start_line,
          numLines: num_lines,
          maxChars: max_chars,
          confirmSensitive: confirm_sensitive
        }) as unknown as Record<string, unknown>
      )
  );

  server.registerTool(
    "build_context_packet",
    {
      title: "Build Context Packet",
      description: "Bundle selected file chunks into a budgeted context packet with citations and coverage warnings.",
      inputSchema: {
        root_id: z.string(),
        files: z.array(z.string()).min(1).max(100),
        query: z.string().optional(),
        budget: z.number().int().min(1000).max(200000).default(24000),
        max_chars_per_file: z.number().int().min(500).max(50000).default(12000),
        confirm_sensitive: z.boolean().default(false)
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async ({ root_id, files, query, budget, max_chars_per_file, confirm_sensitive }) =>
      jsonResult(
        buildPacketFromFiles(root_id, files, {
          query,
          budget,
          maxCharsPerFile: max_chars_per_file,
          confirmSensitive: confirm_sensitive
        }) as unknown as Record<string, unknown>
      )
  );

  server.registerTool(
    "resume_context",
    {
      title: "Resume Context Packet",
      description: "Retrieve previous context packet ledger entries so Claude can resume without losing context.",
      inputSchema: {
        packet_id: z.string().optional()
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ packet_id }) => jsonResult(resumeContext(packet_id) as unknown as Record<string, unknown>)
  );

  server.registerTool(
    "get_audit_summary",
    {
      title: "Get Audit Summary",
      description: "Return recent access/audit events for local file reads, blocked sensitive access, and relay policy decisions.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(50)
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ limit }) => jsonResult(auditSummary(limit) as unknown as Record<string, unknown>)
  );

  server.registerResource(
    "context_packet",
    new ResourceTemplate("claude-local://packet/{packetId}", { list: undefined }),
    {
      title: "Claude Local MCP Context Packet",
      description: "A previously built context packet from the local JSONL context ledger.",
      mimeType: "application/json"
    },
    async (_uri, variables) => {
      const packetId = String(variables.packetId);
      return {
        contents: [
          {
            uri: `claude-local://packet/${encodeURIComponent(packetId)}`,
            mimeType: "application/json",
            text: JSON.stringify(resumeContext(packetId), null, 2)
          }
        ]
      };
    }
  );

  server.registerResource(
    "root_file",
    new ResourceTemplate("claude-local://root/{rootId}/file/{filePath}", { list: undefined }),
    {
      title: "Claude Local MCP Root File",
      description: "A root-relative file read through the same safe file understanding policy as the read_file tool.",
      mimeType: "application/json"
    },
    async (_uri, variables) => {
      const rootId = String(variables.rootId);
      const filePath = decodeURIComponent(String(variables.filePath));
      return {
        contents: [
          {
            uri: `claude-local://root/${encodeURIComponent(rootId)}/file/${encodeURIComponent(filePath)}`,
            mimeType: "application/json",
            text: JSON.stringify(readRegisteredFile(rootId, filePath), null, 2)
          }
        ]
      };
    }
  );

  return server;
}
