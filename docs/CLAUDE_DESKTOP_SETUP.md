# Claude Desktop Setup

## Build

```powershell
cd D:\Project\ClaudechatMCP
npm install
npm run build
```

## Register Local Roots

Register only folders Claude should be able to inspect.

```powershell
node dist\cli.js root add D:\Project\ClaudechatMCP --id ClaudeChatMCP
node dist\cli.js root inspect ClaudeChatMCP
```

## Configure Claude Desktop

Add this MCP server to Claude Desktop's MCP config:

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

Restart Claude Desktop fully after editing the config.

## First Claude Prompts

Try:

```text
Use claude-local-mcp to list my allowed roots.
Inspect root ClaudeChatMCP and tell me the recommended reading strategy.
Search files in ClaudeChatMCP for README.
Read README.md from ClaudeChatMCP and cite what you read.
```

## Packaging Direction

The repo is ready to be packaged as a Claude Desktop `.mcpb` extension later. The bundle should include:

```text
manifest.json
server/
  dist/
  package.json
  node_modules/
icon.png
```

The extension entrypoint should call:

```text
node server/dist/cli.js mcp stdio
```
