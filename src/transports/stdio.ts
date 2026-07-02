import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClaudeLocalMcpServer } from "../mcpServer.js";

export async function runStdioServer(): Promise<void> {
  const server = createClaudeLocalMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Claude Local MCP server running on stdio.");
}
