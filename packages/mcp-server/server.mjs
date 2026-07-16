#!/usr/bin/env node
/**
 * LLP design-system MCP server (stdio).
 *
 * Exposes the git token contract — the single source of truth — as queryable
 * tools for AI coding agents. Read-only by design: proposals for changing
 * tokens go through the Figma plugin → PR route (ADR-0006/0007), not here.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as engine from './lib.mjs';
import { registerTools } from './tools.mjs';

const server = new McpServer({ name: 'llp-design-tokens', version: '0.1.0' });
registerTools(server, engine);
await server.connect(new StdioServerTransport());
