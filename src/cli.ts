#!/usr/bin/env node
import { Command } from "commander";
import { addRoot, listRoots, publicRootView, removeRoot } from "./roots/registry.js";
import { defaultStateDir } from "./paths.js";
import {
  buildPacketFromFiles,
  inspectRegisteredRoot,
  readRegisteredFile,
  scanRegisteredRoot,
  searchContent,
  searchFiles
} from "./core.js";
import { runStdioServer } from "./transports/stdio.js";
import { runHttpServer } from "./transports/streamableHttp.js";
import { auditSummary } from "./security/audit.js";
import { compactLedger, listSnapshots } from "./ledger/compaction.js";
import { createRelayAgentPlan } from "./relay/localAgent.js";
import { createPairingCode } from "./relay/pairing.js";

const program = new Command();

program
  .name("claude-local-mcp")
  .description("Claude-focused local MCP server for safe file understanding and context ledgers.")
  .version("0.1.0");

program.command("init").description("Print and initialize the local state directory.").action(() => {
  printJson({ ok: true, state_dir: defaultStateDir() });
});

const root = program.command("root").description("Manage allowlisted local roots.");

root
  .command("add")
  .argument("<path>", "Local folder path to allowlist.")
  .option("--id <id>", "Stable root id exposed to Claude.")
  .action((rootPath, options) => {
    printJson({ ok: true, root: publicRootView(addRoot(rootPath, options.id)) });
  });

root.command("list").action(() => {
  printJson({ ok: true, roots: listRoots().map(publicRootView) });
});

root.command("remove").argument("<root_id>").action((rootId) => {
  printJson({ ok: true, removed: removeRoot(rootId) });
});

root.command("inspect").argument("<root_id>").option("--max-entries <n>", "Max entries", parseInteger).option("--max-depth <n>", "Max depth", parseInteger).action((rootId, options) => {
  printJson(inspectRegisteredRoot(rootId, { maxEntries: options.maxEntries, maxDepth: options.maxDepth }));
});

program.command("scan").argument("<root_id>").option("--max-entries <n>", "Max entries", parseInteger).option("--max-depth <n>", "Max depth", parseInteger).action((rootId, options) => {
  printJson(scanRegisteredRoot(rootId, { maxEntries: options.maxEntries, maxDepth: options.maxDepth }));
});

program.command("search-files").argument("<root_id>").argument("<query>").option("--max-results <n>", "Max results", parseInteger).action((rootId, query, options) => {
  printJson(searchFiles(rootId, query, { maxResults: options.maxResults }));
});

program.command("search-content").argument("<root_id>").argument("<query>").option("--max-matches <n>", "Max matches", parseInteger).option("--confirm-sensitive", "Allow sensitive files after explicit confirmation.").action((rootId, query, options) => {
  printJson(searchContent(rootId, query, { maxMatches: options.maxMatches, confirmSensitive: Boolean(options.confirmSensitive) }));
});

program.command("read-file").argument("<root_id>").argument("<path>").option("--max-chars <n>", "Max chars", parseInteger).option("--start-line <n>", "Start line", parseInteger).option("--num-lines <n>", "Line count", parseInteger).option("--confirm-sensitive", "Allow sensitive file after explicit confirmation.").action((rootId, filePath, options) => {
  printJson(
    readRegisteredFile(rootId, filePath, {
      maxChars: options.maxChars,
      startLine: options.startLine,
      numLines: options.numLines,
      confirmSensitive: Boolean(options.confirmSensitive)
    })
  );
});

program.command("packet").argument("<root_id>").argument("<files...>").option("--query <query>").option("--budget <n>", "Budget", parseInteger).option("--confirm-sensitive").action((rootId, files, options) => {
  printJson(buildPacketFromFiles(rootId, files, { query: options.query, budget: options.budget, confirmSensitive: Boolean(options.confirmSensitive) }));
});

const mcp = program.command("mcp").description("Run MCP transports.");

mcp.command("stdio").description("Run MCP over stdio for Claude Desktop.").action(async () => {
  await runStdioServer();
});

mcp
  .command("http")
  .description("Run Streamable HTTP MCP on localhost.")
  .option("--host <host>", "Host", "127.0.0.1")
  .option("--port <port>", "Port", parseInteger, 8789)
  .option("--token <token>", "Bearer token. Defaults to CLAUDE_LOCAL_MCP_TOKEN.")
  .action(async (options) => {
    await runHttpServer({ host: options.host, port: options.port, token: options.token });
  });

const relay = program.command("relay").description("Prepare outbound relay pairing.");

relay.command("pair").option("--ttl <seconds>", "Pairing TTL seconds", parseInteger, 300).action((options) => {
  printJson(createPairingCode(options.ttl));
});

relay.command("plan").argument("<relay_url>").action((relayUrl) => {
  printJson(createRelayAgentPlan(relayUrl));
});

program.command("audit").option("--limit <n>", "Limit", parseInteger, 50).action((options) => {
  printJson(auditSummary(options.limit));
});

program.command("compact-ledger").argument("<ledger>").option("--keep-tail <n>", "Tail events", parseInteger, 500).action((ledger, options) => {
  printJson(compactLedger(ledger, options.keepTail));
});

program.command("doctor").description("Check local runtime basics without reading secrets.").action(() => {
  printJson({
    ok: true,
    node: process.version,
    state_dir: defaultStateDir(),
    roots_count: listRoots().length,
    snapshots: listSnapshots(),
    mcp: {
      stdio: "available",
      streamable_http: "available_at_/mcp"
    },
    write_tools: "disabled_in_v1"
  });
});

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Expected integer, got ${value}`);
  }
  return parsed;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
