import http from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createClaudeLocalMcpServer } from "../mcpServer.js";

export interface HttpServerOptions {
  host?: string;
  port?: number;
  token?: string;
}

export async function runHttpServer(options: HttpServerOptions = {}): Promise<http.Server> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8789;
  const token = options.token ?? process.env.CLAUDE_LOCAL_MCP_TOKEN;
  const server = createClaudeLocalMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true
  });
  await server.connect(transport);

  const httpServer = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
      if (url.pathname === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, service: "claude-local-mcp" }));
        return;
      }
      if (url.pathname !== "/mcp") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: false, error: "not_found" }));
        return;
      }
      if (token && request.headers.authorization !== `Bearer ${token}`) {
        response.writeHead(401, {
          "content-type": "application/json",
          "www-authenticate": "Bearer"
        });
        response.end(JSON.stringify({ ok: false, error: "unauthorized" }));
        return;
      }
      const parsedBody = request.method === "POST" ? await readJsonBody(request) : undefined;
      await transport.handleRequest(request, response, parsedBody);
    } catch (error) {
      console.error("Claude Local MCP HTTP error:", error);
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.error(`Claude Local MCP HTTP server listening on http://${host}:${actualPort}/mcp`);
  return httpServer;
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
