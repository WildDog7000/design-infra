// Drive a remote (Streamable HTTP) MCP endpoint the way Claude.ai would.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.argv[2] ?? 'http://localhost:8787/mcp';
const client = new Client({ name: 'remote-sim', version: '0.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));

const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));

const suggest = await client.callTool({ name: 'suggest_token', arguments: { color: '#d73220', limit: 1 } });
console.log('suggest #d73220 →', JSON.parse(suggest.content[0].text)[0].cssVar);

const chain = await client.callTool({
  name: 'resolve_token',
  arguments: { name: 'color.accent.bg.default', theme: 'dark' },
});
console.log('resolve chain →', JSON.parse(chain.content[0].text).chain.map((c) => c.name).join(' → '));

const bad = await client.callTool({ name: 'resolve_token', arguments: { name: 'color.nope' } });
console.log('error path isError:', bad.isError === true);

const list = await client.callTool({ name: 'list_components', arguments: {} });
console.log('components:', JSON.parse(list.content[0].text).components.map((c) => c.slug).join(', '));

const button = await client.callTool({ name: 'get_component', arguments: { slug: 'button' } });
console.log('button css bytes:', JSON.parse(button.content[0].text).css.length);

await client.close();
console.log(`✔ remote MCP E2E passed against ${url}`);
