# Security Model

## Core Rules

- Claude can only access explicitly allowlisted roots.
- MCP arguments use root ids and root-relative paths.
- Raw absolute paths are hidden from Claude by default.
- Path traversal, URLs, drive-qualified paths, and symlink escapes are blocked.
- Sensitive files are blocked until explicit confirmation.
- Output text is redacted for common tokens and private keys.
- V1 does not expose shell, write, edit, or delete.

## Sensitive Files

Blocked by default:

- `.env`, `.env.*`
- `local_token`
- `id_rsa`, `id_ed25519`
- `.pem`, `.key`, `.p12`, `.pfx`
- `.sqlite`, `.db`, `.kdbx`
- browser cookie/profile-like files

Sensitive read returns:

```json
{
  "understanding_status": "blocked_confirmation_required",
  "coverage_warning": "Sensitive file policy requires explicit local confirmation..."
}
```

## JSONL Ledgers

Runtime ledgers are append-only:

```text
roots.jsonl
inventory.jsonl
reads.jsonl
chunks.jsonl
context_packets.jsonl
approvals.jsonl
audit.jsonl
```

They record what Claude was allowed to see and what was blocked. They should not contain raw secrets.

## Binary And Container Files

V1 avoids dumping raw bytes into Claude.

- `.docx`, `.pptx`, and `.xlsx` use a basic OpenXML text extractor.
- `.zip`-like archives return bounded entry listings.
- PDF, image, database, executable, and unknown binary files return metadata unless a deeper extractor is added.

## Remote Policy

Remote relay access is stricter:

- pairing is short-lived
- chunk budgets are smaller
- sensitive files require reconfirmation
- relay must not persist raw content
- write tools are disabled

## Future Write Approval

Write/edit/delete will require a Windows UI in a later phase:

1. Claude proposes a patch.
2. Local server writes an approval draft to `approvals.jsonl`.
3. Windows UI shows diff/risk.
4. User confirms once.
5. UI generates a nonce.
6. User confirms a second time with the nonce.
7. Only then can the patch be applied.
