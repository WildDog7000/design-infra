/**
 * Component-registry tool surface, shared by every transport (like tools.mjs
 * for tokens). The host supplies a loader: { getRegistry(), getFile(path) } —
 * stdio reads the workspace, the remote worker fetches GitHub raw. Hosts
 * without a registry (e.g. the npm-installed stdio server outside this repo)
 * simply don't register these tools.
 */
import { z } from 'zod';

const asText = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });

export function registerComponentTools(server, loader) {
  server.tool(
    'list_components',
    'List the LLP design-system components available for building pages: name, purpose, ' +
      'variants. Start here when composing any UI. Every page must also inline the ' +
      'foundation stylesheet (see get_component with slug "foundation").',
    {},
    async () => {
      const registry = await loader.getRegistry();
      return asText({
        foundation: registry.foundation.description,
        components: registry.components.map(({ name, slug, description, variants, sizes }) => ({
          name,
          slug,
          description,
          variants,
          ...(sizes && { sizes }),
        })),
      });
    }
  );

  server.tool(
    'get_component',
    'Get everything needed to use one component: canonical markup template, modifier ' +
      'classes, and the full CSS to inline. Pass slug "foundation" for the design-token ' +
      'stylesheet (light + dark) that every page must include exactly once. Do not edit ' +
      'the returned CSS — compose with markup and modifier classes only.',
    {
      slug: z.string().describe('Component slug from list_components, or "foundation"'),
    },
    async ({ slug }) => {
      const registry = await loader.getRegistry();
      if (slug === 'foundation') {
        return asText({
          description: registry.foundation.description,
          css: await loader.getFile(registry.foundation.cssFile),
        });
      }
      const component = registry.components.find((c) => c.slug === slug);
      if (!component) {
        throw new Error(
          `unknown component "${slug}" (available: foundation, ${registry.components.map((c) => c.slug).join(', ')})`
        );
      }
      return asText({ ...component, css: await loader.getFile(component.cssFile) });
    }
  );
}
