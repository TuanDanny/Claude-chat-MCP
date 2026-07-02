# Claude Chat MCP

Claude-focused local MCP server for safe file understanding, context ledgers, and relay-ready access.

This repo is intentionally separate from AgentBridge/CodexLink. It reuses the same safety ideas, but the product target is Claude: local roots, file understanding, JSONL context lifecycle, MCP stdio for Claude Desktop, and Streamable HTTP MCP for relay-compatible remote clients.

## Status

MVP foundation:

- TypeScript ESM CLI and MCP server.
- MCP stdio transport for Claude Desktop.
- Streamable HTTP MCP skeleton at `/mcp`.
- Allowlisted root registry backed by JSONL.
- Root inspection tiers for small to very large roots.
- JSONL ledgers for roots, inventory, reads, chunks, context packets, approvals, and audit.
- SQLite metadata index when `node:sqlite` is available.
- Safe root-relative file reads with path traversal protection.
- Sensitive-file confirmation policy.
- Text/code chunking with citations.
- Basic Office OpenXML text extraction for `.docx`, `.pptx`, `.xlsx`.
- Archive entry listing for `.zip`-like files.
- Metadata-only fallback for PDF, image, database, binary, and unknown files.
- Relay pairing/policy skeleton for outbound remote access.
- Write/edit/delete disabled in v1; proposal contract is reserved for a future Windows approval UI.

## Install

```powershell
npm install
npm run build
npm test
```

## Local State

Runtime state defaults to:

```text
%LOCALAPPDATA%\ClaudeLocalMCP
```

Override it for testing or a portable setup:

```powershell
$env:CLAUDE_LOCAL_MCP_HOME="D:\ClaudeLocalMCPState"
```

## Register A Root

Claude can only see roots you explicitly allowlist.

```powershell
node dist\cli.js root add D:\Project\ClaudechatMCP --id ClaudeChatMCP
node dist\cli.js root list
node dist\cli.js root inspect ClaudeChatMCP
node dist\cli.js scan ClaudeChatMCP
```

## Run MCP For Claude Desktop

```powershell
node dist\cli.js mcp stdio
```

Claude Desktop config example:

```json
{
  "mcpServers": {
    "claude-local-mcp": {
      "command": "node",
      "args": [
        "D:\\Project\\ClaudechatMCP\\dist\\cli.js",
        "mcp",
        "stdio"
      ],
      "env": {
        "CLAUDE_LOCAL_MCP_HOME": "D:\\ClaudeLocalMCPState"
      }
    }
  }
}
```

See [docs/CLAUDE_DESKTOP_SETUP.md](docs/CLAUDE_DESKTOP_SETUP.md).

## Run Streamable HTTP MCP

Local HTTP MCP:

```powershell
$env:CLAUDE_LOCAL_MCP_TOKEN="change-me"
node dist\cli.js mcp http --host 127.0.0.1 --port 8789
```

Endpoint:

```text
http://127.0.0.1:8789/mcp
```

Health:

```text
http://127.0.0.1:8789/health
```

See [docs/REMOTE_RELAY.md](docs/REMOTE_RELAY.md).

## MCP Tools

- `list_roots`
- `inspect_root`
- `scan_root`
- `search_files`
- `search_content`
- `read_file`
- `read_file_chunk`
- `build_context_packet`
- `resume_context`
- `get_audit_summary`

## File Understanding Policy

"Read every file" means Claude receives useful, bounded context, not unsafe raw bytes.

- Text/code/config files are read, redacted, chunked, and cited.
- Office OpenXML files return extracted text where possible.
- Archives return bounded entry listings.
- PDF/image/database/binary files return metadata and a clear `understanding_status` unless a deeper extractor exists.
- Sensitive files return metadata and `blocked_confirmation_required` until explicitly confirmed.
- Large roots require inspect/scan/search-first workflows to avoid context loss.

## Development

```powershell
npm run build
npm test
npm run doctor
```

## Safety

V1 is read/understand only.

No shell runner, write, edit, delete, broad drive root, raw absolute-path browsing, or unauthenticated remote file access is exposed.

See [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md).
