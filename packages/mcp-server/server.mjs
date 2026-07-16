#!/usr/bin/env node
/**
 * LLP design-system MCP server (stdio).
 *
 * Exposes the git token contract — the single source of truth — as queryable
 * tools for AI coding agents. Read-only by design: proposals for changing
 * tokens go through the Figma plugin → PR route (ADR-0006/0007), not here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as engine from './lib.mjs';
import { registerTools } from './tools.mjs';
import { registerComponentTools } from './components.mjs';

const server = new McpServer({ name: 'llp-design-tokens', version: '0.1.0' });
registerTools(server, engine);

// Component tools need the (unpublished) components workspace — present in
// this repo, absent for npm installs, which then serve token tools only.
const componentsDir = join(dirname(fileURLToPath(import.meta.url)), '../components');
if (existsSync(join(componentsDir, 'registry.json'))) {
  registerComponentTools(server, {
    getRegistry: async () => JSON.parse(readFileSync(join(componentsDir, 'registry.json'), 'utf8')),
    getFile: async (path) => readFileSync(join(componentsDir, path), 'utf8'),
  });
}

await server.connect(new StdioServerTransport());
