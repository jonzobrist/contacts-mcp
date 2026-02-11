import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';

export function registerGetTool(server: McpServer, store: GitContactStore): void {
  server.registerTool('get_contact', {
    description: 'Get full details of a contact by ID. Returns all fields including metadata.',
    inputSchema: {
      id: z.string().describe('Contact UUID'),
    },
  }, async ({ id }) => {
    try {
      const contact = await store.get(id);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(contact, null, 2),
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
