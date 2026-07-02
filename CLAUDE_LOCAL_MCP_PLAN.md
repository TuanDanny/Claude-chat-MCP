# Ke Hoach Claude Local MCP

## 1. Muc Tieu

Tao mot repo MCP rieng cho Claude, nam tai:

```text
D:\Project\ClaudechatMCP
```

Repo nay khong gop vao `D:\AgentBridge`. AgentBridge/CodexLink chi duoc dung lam nguon tham khao ve cach thiet ke an toan: allowlist root, redaction, relay pairing, audit, doctor/test va cach quan ly context.

Muc tieu san pham:

- Claude chat co the xem, doc va hieu file local tren may theo MCP chuan ky thuat cua Anthropic/Model Context Protocol.
- Ho tro root nho vai chuc file den root rat lon, co the len toi hang tram nghin hoac 1 trieu file/folder.
- Khong nhoi toan bo noi dung vao context lam Claude quen/lost-in-the-middle; moi lan doc phai co context packet, citation, coverage va lich su `.jsonl`.
- Ban dau chi read/understand. Ghi/sua/xoa file de danh cho phase sau, co contract san va bat buoc xac nhan 2 lan qua Windows UI rieng.

## 2. Nguon Chuan Va Dinh Huong

Tham chieu chinh:

- MCP Specification: https://modelcontextprotocol.io/specification/2025-06-18
- MCP Transports: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- MCP Tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP Resources: https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- MCP Roots: https://modelcontextprotocol.io/specification/2025-06-18/client/roots
- Claude Desktop Extensions `.mcpb`: https://www.anthropic.com/engineering/desktop-extensions
- Claude MCP Connector: https://platform.claude.com/docs/en/agents-and-tools/mcp-connector

Nguyen tac:

- Dung MCP SDK chinh thuc, khong fake HTTP JSON endpoint thanh MCP.
- Desktop local uu tien `stdio` va `.mcpb`.
- Remote dung Streamable HTTP MCP that qua relay outbound co pairing.
- Khong expose raw local filesystem path cho Claude neu khong can.
- Khong expose `/mcp` gia nhu mot endpoint custom JSON. Neu co `/mcp` thi phai la Streamable HTTP MCP dung protocol.

## 3. Kien Truc Tong The

### 3.1 Repo moi

Repo moi nen co cau truc du kien:

```text
D:\Project\ClaudechatMCP
  package.json
  tsconfig.json
  README.md
  CLAUDE_LOCAL_MCP_PLAN.md
  src/
    cli.ts
    mcpServer.ts
    transports/
      stdio.ts
      streamableHttp.ts
    roots/
      registry.ts
      policy.ts
    scan/
      inspector.ts
      scanner.ts
      indexStore.ts
    files/
      safePath.ts
      typeDetect.ts
      extractors.ts
      chunker.ts
      contextPacket.ts
    ledger/
      jsonlStore.ts
      compaction.ts
    relay/
      localAgent.ts
      pairing.ts
      remotePolicy.ts
    security/
      redaction.ts
      sensitivePolicy.ts
      audit.ts
    approvals/
      contract.ts
  test/
  docs/
```

### 3.2 Runtime state local

State khong nen nam trong source repo neu khong can. Mac dinh luu tai:

```text
%LOCALAPPDATA%\ClaudeLocalMCP\
```

Ben trong gom:

```text
config.json
roots.jsonl
inventory.jsonl
reads.jsonl
chunks.jsonl
context_packets.jsonl
approvals.jsonl
audit.jsonl
index\<rootId>.sqlite
snapshots\
```

Trong do:

- `.jsonl` la source of truth va audit ledger.
- SQLite la index phu de search nhanh, co the rebuild tu `.jsonl`.
- Khong luu secret raw vao ledger.
- Moi access quan trong deu co event de xem lai Claude da thay gi, doc file nao, bi chan file nao va context packet nao da duoc gui.

## 4. Ket Noi Claude

### 4.1 Claude Desktop local

Day la duong chinh cho trai nghiem chat doc local tot nhat.

Transport:

- MCP `stdio`.
- Claude Desktop launch server nhu subprocess.
- Server chi ghi JSON-RPC MCP hop le ra stdout.
- Log chi ghi stderr.

Deliverable:

- Cau hinh manual cho Claude Desktop.
- Sau do dong goi `.mcpb` de cai bang double-click.

### 4.2 Remote Streamable HTTP MCP

Dung khi can Claude API/remote-compatible client ket noi qua mang.

Mo hinh:

- Local agent chay tren may user.
- Local agent ket noi outbound toi relay.
- Relay co pairing code ngan han.
- Claude/remote client ket noi MCP Streamable HTTP toi relay.
- Relay forward request den local agent da pair.
- Relay khong luu raw file content.

Chinh sach remote chat hon Desktop:

- Chi root allowlist.
- Session/pairing ngan han.
- Chunk nho hon.
- Audit day du hon.
- File nhay cam can xac nhan lai.
- Khong cho write/edit/delete trong v1.

## 5. Quan Ly Root

Claude chi duoc thay cac root da allowlist.

Moi root co:

```json
{
  "root_id": "project-safe-id",
  "name": "Project Name",
  "root_hint": "D:\\...\\ProjectName",
  "absolute_path_local_only": "D:\\Real\\Path",
  "created_at": "ISO timestamp",
  "last_seen": "ISO timestamp",
  "policy": {
    "read": true,
    "remote_read": "restricted",
    "sensitive_read": "confirm",
    "write": false
  }
}
```

Tool dang ky root chi chay local qua CLI/local UI, khong de Claude tu dang ky o dia rong.

Khong cho phep:

- Root la o dia goc nhu `C:\` hoac `D:\`.
- Root system nhu `C:\Windows`, `Program Files`, browser profile, AppData rong.
- Path traversal, symlink/junction thoat khoi root.
- Project id co dang duong dan.

## 6. Phan Tang Root Lon

Truoc khi doc, server phai inspect root truoc.

Phan tang de quyet dinh cach doc:

| So file/folder uoc tinh | Chien luoc |
| --- | --- |
| `<= 500` | Live tree + doc truc tiep cac file quan trong, context packet nho |
| `501 - 3000` | Inventory day du, sap uu tien README/config/src/test, doc theo nhom |
| `3001 - 50000` | Scan nen + SQLite index, search-first, khong dump tree day du |
| `50001 - 250000` | Shard theo top-level, incremental scan, context packet theo query/task |
| `> 250000` den `1M+` | Partitioned index, bat buoc search/filter, coverage report ro rang |

Moi ket qua lon phai noi ro:

- Inventory complete hay partial.
- Bi truncate hay khong.
- File/folder nao bi skip.
- Root dang o tier nao.
- Nen doc gi tiep theo.

## 7. File Understanding Pipeline

Y nghia cua "doc moi file":

Khong chi mo file thanh raw bytes. MCP phai tra ve context de Claude co the hieu va dung duoc.

Pipeline:

1. `safePath`: validate path nam trong root, khong traversal, khong thoat qua symlink/junction.
2. `typeDetect`: detect mime bang extension + magic bytes + UTF-8 test.
3. `sensitivePolicy`: chan hoac yeu cau xac nhan neu la `.env`, key, token, database, browser profile, backup nhay cam.
4. `extractors`: lay text/structure/metadata phu hop voi tung loai file.
5. `chunker`: chia chunk co line/page/section citation.
6. `contextPacket`: tao packet vua context budget, co summary, citations, coverage va next reads.
7. `ledger`: ghi lai event vao `.jsonl`.

Ket qua doc file nen co schema:

```json
{
  "ok": true,
  "root_id": "project",
  "path": "relative/path.ext",
  "file_type": "text | pdf | image | office | archive | db | binary | unknown",
  "understanding_status": "complete | partial | metadata_only | blocked_confirmation_required | unsupported_extractor",
  "size": 12345,
  "hash": "sha256...",
  "redacted": false,
  "truncated": false,
  "coverage_warning": null,
  "chunks": [
    {
      "chunk_id": "chunk_...",
      "citation": "relative/path.ext:1-80",
      "text": "..."
    }
  ],
  "metadata": {},
  "next_actions": []
}
```

## 8. Ho Tro Loai File

### 8.1 V1 bat buoc

- Text/code/config: `.txt`, `.md`, `.json`, `.jsonl`, `.yaml`, `.toml`, `.ini`, `.csv`, source code.
- PDF: metadata + text extraction neu co text layer; neu khong co thi `metadata_only` hoac OCR de phase sau.
- Office: `.docx`, `.xlsx`, `.pptx` extract text/structure co gioi han.
- Image: metadata, kich thuoc, mime, hash; OCR/caption de phase sau neu chua on dinh.
- Archive: list entries an toan, khong extract het mac dinh.
- Database/binary/exe: metadata/hash/sample an toan; noi ro khong the hieu noi dung neu chua co extractor.

### 8.2 File nhay cam

Mac dinh:

- Hien metadata/toi da ten file va ly do bi khoa.
- Khong doc content neu chua co xac nhan.
- Remote can xac nhan lai.

Nhom nhay cam:

- `.env`, `.env.*`
- private keys: `.pem`, `.key`, `.p12`, `.pfx`, `id_rsa`, `id_ed25519`
- token/local auth files
- database: `.sqlite`, `.db`
- browser profile/session/cookie
- backup co kha nang chua secret

## 9. MCP Tools Va Resources

### 9.1 Tools v1

`list_roots`

- Liet ke root allowlist.
- Khong tra raw absolute path mac dinh.

`inspect_root`

- Dem uoc tinh file/folder.
- Xac dinh tier doc.
- Tra ve recommended strategy.

`scan_root`

- Scan incremental.
- Ghi `inventory.jsonl`.
- Update SQLite index phu.
- Co progress va co the resume.

`search_files`

- Tim theo ten/path/glob/type/size.

`search_content`

- Tim text trong file da index hoac live grep co gioi han.
- Redact snippet.

`read_file`

- Doc/extract mot file theo relative path.
- Tra chunk/citation/coverage.

`read_file_chunk`

- Doc chunk cu the theo `chunk_id`, line range, page range hoac byte-safe range.

`build_context_packet`

- Gom nhieu chunk/file thanh packet Claude co the dung.
- Co budget, summary, citation va file skipped.

`resume_context`

- Lay lai context packet/lich su doc gan nhat de Claude khong mat ngu canh.

`get_audit_summary`

- Xem Claude da truy cap gi, bi chan gi, packet nao da gui.

### 9.2 Resources v1

URI noi bo:

```text
claude-local://root/{rootId}/file/{encodedRelativePath}
claude-local://packet/{packetId}
```

Resource read phai di qua cung policy voi `read_file`.

## 10. JSONL Context Ledger

JSONL la trung tam quan ly chu trinh context.

File:

`roots.jsonl`

- Root added/removed/policy changed.

`inventory.jsonl`

- Scan batch, file metadata, directory summary, skipped dirs.

`reads.jsonl`

- Moi lan read/extract, status, policy result, warning.

`chunks.jsonl`

- Chunk id, file hash, range, text hash, size, extractor version.

`context_packets.jsonl`

- Packet id, query/task, chunk ids, citations, summary, budget, coverage.

`approvals.jsonl`

- Future write/edit proposal, approval state, nonce, UI action.

`audit.jsonl`

- Security/audit events, remote session, pairing, denied access.

Compaction:

- Tao snapshot dinh ky.
- Giu event gan day chi tiet.
- Luu summary cho event cu.
- SQLite co the rebuild tu snapshot + JSONL sau snapshot.

## 11. Bao Mat

Bat buoc:

- Allowlist root.
- Project-relative path trong MCP tool arguments.
- Khong shell execution trong v1.
- Khong write/edit/delete trong v1.
- Khong raw secret trong log/ledger.
- Redaction cho output text/snippet.
- Confirmation cho file nhay cam.
- Remote policy chat hon Desktop.
- Origin/auth/session validation cho Streamable HTTP.
- Pairing ngan han, token khong in ra log.
- Audit day du cho remote access.

Khong lam:

- Khong expose ca o dia.
- Khong accept absolute path tu Claude.
- Khong doc `.env` raw mac dinh.
- Khong extract archive toan bo mac dinh.
- Khong fake MCP bang HTTP JSON custom.

## 12. Contract Ghi/Sua Sau Nay

V1 chi chua contract, khong apply.

Tool phase sau:

```text
propose_file_change
preview_patch
request_write_approval
apply_approved_patch
```

Flow phase sau:

1. Claude tao proposal/patch.
2. Server ghi approval draft vao `approvals.jsonl`.
3. Windows UI hien diff va risk.
4. User xac nhan lan 1.
5. UI tao nonce/ngan han.
6. User xac nhan lan 2 bang nonce.
7. Server moi apply patch.
8. Audit event + file hash truoc/sau.

## 13. CLI Du Kien

```text
claude-local-mcp init
claude-local-mcp root add <path> --id <id>
claude-local-mcp root list
claude-local-mcp root inspect <id>
claude-local-mcp scan <id>
claude-local-mcp mcp stdio
claude-local-mcp mcp http --host 127.0.0.1 --port 8789
claude-local-mcp relay pair
claude-local-mcp doctor
claude-local-mcp audit recent
```

## 14. MVP Deliverables

MVP phai co:

- Repo TypeScript build duoc.
- MCP stdio server chay duoc.
- Streamable HTTP MCP skeleton chay dung protocol.
- Root allowlist.
- Inspect/scan/search/read/context packet tools.
- JSONL ledger + SQLite index phu.
- File understanding pipeline v1.
- Sensitive file lock.
- Relay outbound pairing skeleton.
- README cai Claude Desktop.
- Tai lieu `.mcpb` packaging.
- Test unit + MCP in-memory + stdio smoke.

## 15. Test Plan

Unit tests:

- Path traversal.
- Windows drive path.
- Symlink/junction escape.
- Root allowlist.
- Sensitive file lock.
- Redaction.
- Type detection.
- Extractor fallback.
- Chunking.
- JSONL append/replay/compact.
- SQLite rebuild tu JSONL.

MCP tests:

- `tools/list`.
- `tools/call` tung tool.
- `resources/list`.
- `resources/read`.
- Error schema khi path invalid/file blocked/truncated.

Transport tests:

- stdio server khong ghi log ra stdout.
- Streamable HTTP initialize/tools/list/tools/call.
- Missing/invalid session.
- Auth/pairing expiry.

Scale tests:

- Root synthetic 500 entries.
- Root synthetic 3000 entries.
- Root synthetic 50000 entries.
- Root synthetic 250000 entries.
- Root synthetic 1M entries neu may cho phep.
- Dam bao response khong vuot budget va co coverage warning.

Windows tests:

- Unicode path.
- Locked file.
- Long path.
- Permission denied.
- File dang thay doi khi scan.
- Restart Claude Desktop sau khi update config.

## 16. Ranh Gioi Scope

Trong v1:

- Co read/understand local file.
- Co Desktop stdio.
- Co remote Streamable HTTP MCP qua relay skeleton.
- Co ledger JSONL va index phu.
- Co docs.

Khong trong v1:

- Khong apply write/edit/delete.
- Khong Windows UI day du.
- Khong cloud account/team workspace.
- Khong OAuth enterprise day du neu chua can.
- Khong dam bao OCR/caption moi image/PDF scan trong ban dau.

## 17. Dieu Kien Duyet Truoc Khi Implement

Can user duyet cac diem sau truoc khi bat dau scaffold/code:

- Ten repo/package.
- Co dung Node 24+ va TypeScript ESM khong.
- Co chap nhan `%LOCALAPPDATA%\ClaudeLocalMCP\` lam state dir mac dinh khong.
- Co chap nhan `.jsonl` la source of truth va SQLite la index phu khong.
- Co chap nhan v1 read-only va write/edit de phase sau khong.
- Co chap nhan remote relay chat hon Desktop khong.

## 18. Lenh Hanh Dong Sau Khi Duoc Duyet

Sau khi user doc va duyet file nay, moi thuc hien:

```text
npm init
npm install @modelcontextprotocol/sdk zod commander
npm install -D typescript vitest @types/node
tao src/test/docs
implement MVP theo tung milestone
```

Cho den khi duoc duyet, khong scaffold repo, khong cai dependency, khong sua file khac.
