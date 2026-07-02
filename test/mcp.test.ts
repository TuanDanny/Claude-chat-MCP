import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import fs from "node:fs";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClaudeLocalMcpServer } from "../src/mcpServer.js";
import { addRoot } from "../src/roots/registry.js";
import { runHttpServer } from "../src/transports/streamableHttp.js";

const tempDirs: string[] = [];
const clients: Client[] = [];
const servers: Awaited<ReturnType<typeof createConnectedClient>>[] = [];
const httpServers: http.Server[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeText(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

async function createConnectedClient() {
  const server = createClaudeLocalMcpServer();
  const client = new Client({ name: "claude-local-test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  clients.push(client);
  return { server, client };
}

function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  if (!("content" in result)) return "";
  const first = result.content[0];
  return first && first.type === "text" ? first.text : "";
}

beforeEach(() => {
  process.env.CLAUDE_LOCAL_MCP_HOME = makeTempDir("claude-local-mcp-state-");
});

afterEach(async () => {
  for (const client of clients.splice(0)) {
    await client.close().catch(() => undefined);
  }
  for (const item of servers.splice(0)) {
    await item.server.close().catch(() => undefined);
  }
  for (const item of httpServers.splice(0)) {
    await new Promise<void>((resolve) => item.close(() => resolve()));
  }
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.CLAUDE_LOCAL_MCP_HOME;
});

describe("Claude Local MCP server", () => {
  it("lists required tools and reads allowlisted files", async () => {
    const project = makeTempDir("claude-local-mcp-project-");
    writeText(project, "README.md", "# MCP\n\nHello Claude.\n");
    addRoot(project, "McpRoot");
    const connected = await createConnectedClient();
    servers.push(connected);

    const tools = await connected.client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "list_roots",
        "inspect_root",
        "scan_root",
        "search_files",
        "search_content",
        "read_file",
        "read_file_chunk",
        "build_context_packet",
        "resume_context",
        "get_audit_summary"
      ])
    );

    const read = await connected.client.callTool({
      name: "read_file",
      arguments: { root_id: "McpRoot", path: "README.md" }
    });
    expect(firstText(read)).toContain("Hello Claude");

    const packet = await connected.client.callTool({
      name: "build_context_packet",
      arguments: { root_id: "McpRoot", files: ["README.md"], query: "demo" }
    });
    expect(firstText(packet)).toContain("packet_");
  });

  it("exposes context packets as MCP resources", async () => {
    const project = makeTempDir("claude-local-resource-project-");
    writeText(project, "notes.txt", "Resource-backed context.\n");
    addRoot(project, "ResourceRoot");
    const connected = await createConnectedClient();
    servers.push(connected);

    const packetResult = JSON.parse(
      firstText(
        await connected.client.callTool({
          name: "build_context_packet",
          arguments: { root_id: "ResourceRoot", files: ["notes.txt"] }
        })
      )
    ) as { packet_id: string };

    const resource = await connected.client.readResource({
      uri: `claude-local://packet/${packetResult.packet_id}`
    });
    expect(JSON.stringify(resource)).toContain(packetResult.packet_id);
  });

  it("serves tools over Streamable HTTP MCP", async () => {
    const httpServer = await runHttpServer({ port: 0 });
    httpServers.push(httpServer);
    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address.");
    }
    const client = new Client({ name: "claude-local-http-test-client", version: "0.1.0" });
    clients.push(client);
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`));
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("read_file");
  });
});
