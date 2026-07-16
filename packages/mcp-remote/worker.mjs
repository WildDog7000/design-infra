/**
 * LLP design-system MCP server, remote form (Cloudflare Worker).
 *
 * Same query engine and tool surface as the stdio server — only the shell
 * differs. Contract freshness follows the designer-truth model (ADR-0009):
 * DTCG source is fetched from the repo's main branch and cached briefly,
 * so answers track the merged contract without redeploys.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpHandler } from 'agents/mcp';
import { CONTRACT_FILES, createEngine } from '@llp-design/mcp-server/engine.mjs';
import { registerTools } from '@llp-design/mcp-server/tools.mjs';

const RAW_BASE = 'https://raw.githubusercontent.com/WildDog7000/design-infra/main/packages/tokens/tokens/';
const TTL_MS = 5 * 60 * 1000;

let cached; // { engine, at }

async function getEngine() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.engine;
  try {
    const entries = await Promise.all(
      CONTRACT_FILES.map(async (file) => {
        const res = await fetch(RAW_BASE + file);
        if (!res.ok) throw new Error(`contract fetch failed: ${file} → HTTP ${res.status}`);
        return [file, await res.json()];
      })
    );
    cached = { engine: createEngine(Object.fromEntries(entries)), at: Date.now() };
  } catch (err) {
    // Serve stale contract rather than nothing if GitHub is unreachable.
    if (cached) return cached.engine;
    throw err;
  }
  return cached.engine;
}

// The engine is fetched lazily so a cold worker never blocks on GitHub
// before the MCP handshake; tools.mjs awaits every engine call.
const lazyEngine = {
  searchTokens: async (args) => (await getEngine()).searchTokens(args),
  resolveToken: async (name, theme) => (await getEngine()).resolveToken(name, theme),
  suggestToken: async (color, opts) => (await getEngine()).suggestToken(color, opts),
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/') {
      return new Response(
        'LLP design-tokens MCP server. Connect your MCP client to /mcp ' +
          '(read-only; contract source: github.com/WildDog7000/design-infra)',
        { headers: { 'content-type': 'text/plain' } }
      );
    }
    // No server-initiated stream: this server is read-only and never pushes
    // notifications, and a hanging SSE GET blocks subsequent POSTs in some
    // client connection pools (observed with Node/undici through the CF edge).
    // 405 is spec-compliant; clients fall back to plain request/response.
    if (request.method === 'GET' && pathname === '/mcp') {
      return new Response('This server does not offer a server-initiated event stream.', {
        status: 405,
        headers: { allow: 'POST' },
      });
    }
    // A fresh McpServer per request: unlike stdio (one process, one
    // connection), every HTTP request binds to a new transport, and a
    // server instance can only connect once. The engine cache above is
    // module-level, so the contract is not refetched per request.
    // enableJsonResponse: plain application/json replies instead of SSE —
    // nothing here streams, and JSON avoids edge buffering quirks entirely.
    const server = new McpServer({ name: 'llp-design-tokens', version: '0.1.0' });
    registerTools(server, lazyEngine);
    return createMcpHandler(server, { route: '/mcp', enableJsonResponse: true })(request, env, ctx);
  },
};
