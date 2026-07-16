/**
 * MCP tool surface, shared by every transport (stdio entry, remote worker).
 * Takes any object implementing the engine API so each host can bind its own
 * data source.
 */
import { z } from 'zod';
import { THEMES } from './engine.mjs';

const theme = z.enum(THEMES).default('light').describe('Color theme to query');
const asText = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });

export function registerTools(server, engine) {
  server.tool(
    'search_tokens',
    'Search LLP design tokens by name substring, with optional type/tier filters. ' +
      'Prefer usage-tier tokens in component code — they encode roles, not raw scales. ' +
      'Each result includes the CSS custom property name to use (cssVar).',
    {
      query: z.string().default('').describe('Name substring, separator-insensitive (e.g. "accent bg")'),
      type: z.enum(['color', 'dimension', 'fontFamily', 'fontWeight']).optional().describe('DTCG $type filter'),
      tier: z.enum(['primitive', 'semantic', 'usage']).optional().describe('Contract tier filter'),
      theme,
    },
    async (args) => asText(await engine.searchTokens(args))
  );

  server.tool(
    'resolve_token',
    'Resolve a token to its literal value, showing the full alias chain through the ' +
      'three contract tiers (usage → semantic → primitive). Chains differ per theme: ' +
      'the dark primitive scale is re-anchored, so the same role may map to a different scale position.',
    {
      name: z.string().describe('Token dot-path, e.g. "color.accent.bg.default"'),
      theme,
    },
    async ({ name, theme }) => asText(await engine.resolveToken(name, theme))
  );

  server.tool(
    'suggest_token',
    'Given a raw color (e.g. sampled from a mockup or found hard-coded in CSS), rank the ' +
      'closest design tokens. Exact matches come first; usage-tier tokens win ties. ' +
      'Use this to replace hard-coded colors with contract tokens.',
    {
      color: z.string().describe('Hex color: #rgb, #rrggbb or #rrggbbaa'),
      theme,
      limit: z.number().int().min(1).max(20).default(5),
    },
    async ({ color, ...opts }) => asText(await engine.suggestToken(color, opts))
  );
}
