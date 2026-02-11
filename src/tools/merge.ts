import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';
import { mergeContacts } from '../contacts/index.js';
import { toSummary } from '../types/index.js';

export function registerMergeTool(server: McpServer, store: GitContactStore): void {
  server.registerTool('merge_contacts', {
    description: 'Merge two or more contacts into one. The first ID is the primary (kept); others are archived.',
    inputSchema: {
      contactIds: z.array(z.string()).min(2).describe('Contact IDs to merge (first = primary)'),
      strategy: z.enum(['keep-newest', 'keep-oldest', 'union']).optional().default('union')
        .describe('How to resolve field conflicts'),
      fieldOverrides: z.record(z.string(), z.string()).optional()
        .describe('Manual overrides: { fieldName: contactIdToUseForThatField }'),
    },
  }, async ({ contactIds, strategy, fieldOverrides }) => {
    try {
      // Load all contacts
      const contacts = await Promise.all(contactIds.map(id => store.get(id)));

      // Merge
      const result = mergeContacts(contacts, strategy, fieldOverrides);

      // Write to store
      const primaryId = contactIds[0];
      const secondaryIds = contactIds.slice(1);
      await store.mergeAndArchive(primaryId, secondaryIds, result.mergedContact);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            mergedContact: toSummary(result.mergedContact),
            archivedIds: secondaryIds,
            strategy,
            message: `Merged ${contactIds.length} contacts into ${result.mergedContact.fullName}`,
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
