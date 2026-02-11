import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';

export function registerHistoryTool(server: McpServer, store: GitContactStore): void {
  server.registerTool('history', {
    description: 'Show change history for a specific contact or globally. Shows git commits with operation types.',
    inputSchema: {
      contactId: z.string().optional().describe('Show history for a specific contact (omit for global history)'),
      limit: z.number().optional().default(20).describe('Max entries to return'),
    },
  }, async ({ contactId, limit }) => {
    try {
      const entries = await store.getHistory(limit, contactId);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            scope: contactId ? `contact:${contactId}` : 'global',
            entries,
          }, null, 2),
        }],
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });
}
