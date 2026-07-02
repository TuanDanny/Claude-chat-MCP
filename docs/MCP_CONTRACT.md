# MCP Contract

## Tools

### `list_roots`

Lists allowlisted roots without raw absolute paths.

### `inspect_root`

Returns scale tier and reading strategy before browsing.

### `scan_root`

Scans root metadata into JSONL and SQLite index.

### `search_files`

Searches file paths by query.

### `search_content`

Searches text files with bounded file size and redacted snippets.

### `read_file`

Reads one root-relative file through safe path, policy, extraction, chunking, and citation.

### `read_file_chunk`

Reads a line-window chunk from a file.

### `build_context_packet`

Builds a budgeted context packet from selected files.

### `resume_context`

Returns previous context packets from the JSONL ledger.

### `get_audit_summary`

Returns recent audit events.

## Resources

```text
claude-local://packet/{packetId}
claude-local://root/{rootId}/file/{filePath}
```

Resources use the same safety policy as tools.
