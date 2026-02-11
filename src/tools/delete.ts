import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';

export function registerDeleteTool(server: McpServer, store: GitContactStore): void {
  server.registerTool('delete_contact', {
    description: 'Soft-delete a contact by moving it to the archive. Can be restored via rollback.',
    inputSchema: {
      id: z.string().describe('Contact UUID to archive'),
      permanent: z.boolean().optional().default(false).describe('If true, permanently remove (cannot be undone without git)'),
    },
  }, async ({ id, permanent }) => {
    try {
      await store.delete(id, permanent);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            id,
            action: permanent ? 'permanently deleted' : 'archived',
            message: permanent
              ? 'Contact permanently deleted'
              : 'Contact archived. Use rollback to restore.',
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
