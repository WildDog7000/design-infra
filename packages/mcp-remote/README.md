# @llp-design/mcp-remote

Remote form of the LLP design-tokens MCP server (ADR-0010): a Cloudflare
Worker serving the same query engine as `@llp-design/mcp-server` over
Streamable HTTP. Built for designers and web clients — no Node, no repo
checkout, no config files.

**Live endpoint**: `https://llp-design-tokens-mcp.llgffs-d91.workers.dev/mcp`

## Connect (Claude.ai / Claude Desktop)

Settings → Connectors → **Add custom connector** → paste the endpoint URL.
Then ask things like *"what's `#d73220` in our design system?"*

## How it differs from the stdio/npm form

| | npm package | this worker |
|---|---|---|
| Audience | engineers / coding agents | designers / web clients |
| Contract freshness | pinned to dependency version | GitHub raw `main`, 5-min cache |
| Transport | stdio | Streamable HTTP (JSON responses, no SSE) |

Same `engine.mjs` + `tools.mjs` under both shells.

## Develop & deploy

```sh
npm run dev --workspace @llp-design/mcp-remote      # local, http://localhost:8787/mcp
npm run deploy --workspace @llp-design/mcp-remote   # needs wrangler login
node packages/mcp-remote/e2e.mjs <url>/mcp          # client round-trip check
```

CI build-checks the bundle with `wrangler deploy --dry-run`; run `e2e.mjs`
against production after deploying.
