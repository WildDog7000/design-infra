/**
 * End-to-end: spawn the real server over stdio and drive it with the real
 * MCP client, exactly as Claude Code would.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));

test('MCP client round-trip over stdio', async (t) => {
  const client = new Client({ name: 'e2e-test', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [join(here, 'server.mjs')] })
  );
  t.after(() => client.close());

  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ['resolve_token', 'search_tokens', 'suggest_token']
  );

  const search = await client.callTool({
    name: 'search_tokens',
    arguments: { query: 'accent bg', tier: 'usage' },
  });
  const hits = JSON.parse(search.content[0].text);
  assert.ok(hits.some((h) => h.cssVar === '--llp-color-accent-bg-default'));

  const resolve = await client.callTool({
    name: 'resolve_token',
    arguments: { name: 'color.accent.bg.default', theme: 'dark' },
  });
  const { chain, value } = JSON.parse(resolve.content[0].text);
  assert.equal(chain[0].tier, 'usage');
  assert.match(value, /^#/);

  const suggest = await client.callTool({
    name: 'suggest_token',
    arguments: { color: value, theme: 'dark', limit: 3 },
  });
  const ranked = JSON.parse(suggest.content[0].text);
  assert.equal(ranked[0].exact, true);

  const bad = await client.callTool({
    name: 'resolve_token',
    arguments: { name: 'color.nope' },
  });
  assert.equal(bad.isError, true, 'unknown token surfaces as tool error, not a crash');
});
