# @llp/mcp-server

Read-only MCP server exposing the LLP token contract to AI coding agents
(ADR-0008). Third consumer of the same DTCG source of truth, after the
platform deliverables (CSS/TS/JSON) and the Figma plugin.

## Tools

| Tool | Question it answers |
|---|---|
| `search_tokens` | "What accent background tokens exist?" — name/type/tier filtered search |
| `resolve_token` | "What does `color.accent.bg.default` actually resolve to in dark?" — full usage → semantic → primitive alias chain |
| `suggest_token` | "The mockup has `#d73220`, which token should I use?" — nearest-token lookup, usage tier preferred |

Every result carries the CSS custom property name (`--llp-…`) consumers
actually type.

## Use it

Claude Code picks the server up automatically from the repo-root `.mcp.json`.
Manual registration elsewhere:

```sh
node packages/mcp-server/server.mjs   # stdio transport
```

## Test

```sh
npm test --workspace @llp/mcp-server
```

Unit tests cover the query engine; `server.e2e.test.mjs` spawns the real
server and drives it with the real MCP client over stdio.

## Boundaries

Read-only by design: token changes go through the proposal channel
(Figma plugin → overrides.json → PR, ADR-0006/0007), never through MCP.
