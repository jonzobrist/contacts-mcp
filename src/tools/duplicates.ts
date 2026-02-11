import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';
import { findDuplicates } from '../contacts/index.js';

export function registerDuplicatesTool(server: McpServer, store: GitContactStore): void {
  server.registerTool('find_duplicates', {
    description: 'Scan contacts for potential duplicates. Returns pairs with confidence scores and matched fields.',
    inputSchema: {
      threshold: z.number().min(0).max(1).optional().default(0.6)
        .describe('Minimum confidence score (0-1) to report as duplicate'),
      limit: z.number().optional().default(50).describe('Max duplicate pairs to return'),
    },
  }, async ({ threshold, limit }) => {
    const contacts = await store.list(false);
    const candidates = findDuplicates(contacts, { threshold, limit });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          totalContacts: contacts.length,
          duplicatesFound: candidates.length,
          candidates,
        }, null, 2),
      }],
    };
  });
}
