import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';
import { searchContacts } from '../contacts/index.js';

export function registerSearchTool(server: McpServer, store: GitContactStore): void {
  server.registerTool('search_contacts', {
    description: 'Search contacts across all fields using fuzzy matching. Returns ranked results.',
    inputSchema: {
      query: z.string().describe('Search query (name, email, phone, org, etc.)'),
      limit: z.number().optional().default(20).describe('Maximum results to return'),
      includeArchived: z.boolean().optional().default(false).describe('Include archived/deleted contacts'),
    },
  }, async ({ query, limit, includeArchived }) => {
    const contacts = await store.list(includeArchived);
    const results = searchContacts(contacts, query, limit);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(results, null, 2),
      }],
    };
  });
}
