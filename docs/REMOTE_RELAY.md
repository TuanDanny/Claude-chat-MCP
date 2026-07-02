# Remote Relay Plan

Remote access is intentionally stricter than Claude Desktop local stdio.

## Local HTTP MCP

Run a local Streamable HTTP MCP endpoint:

```powershell
$env:CLAUDE_LOCAL_MCP_TOKEN="change-me"
node dist\cli.js mcp http --host 127.0.0.1 --port 8789
```

Endpoints:

```text
GET  /health
POST /mcp
GET  /mcp
```

If `CLAUDE_LOCAL_MCP_TOKEN` or `--token` is set, `/mcp` requires:

```text
Authorization: Bearer <token>
```

## Relay Model

V1 includes the local policy and pairing skeleton:

```powershell
node dist\cli.js relay pair
node dist\cli.js relay plan wss://relay.example.com/session
```

Intended production model:

- Local agent connects outbound to relay.
- Relay requires short-lived pairing.
- Relay forwards MCP requests to the paired local agent.
- Relay does not store raw file content.
- Remote reads use stricter limits than Desktop local.
- Sensitive files require reconfirmation.
- Write/edit/delete are disabled in v1.

## Remote Limits

Current policy skeleton:

```text
max_chars_per_file: 8000
max_context_packet_budget: 16000
sensitive_files: requires_reconfirmation
write_tools: disabled_in_v1
relay_storage: no_raw_file_content
```

## Not Implemented In V1

- Hosted relay deployment.
- OAuth enterprise flow.
- Windows approval UI.
- Write/edit/delete.
