import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';
import { importVCardFile } from '../contacts/index.js';

export function registerImportTool(server: McpServer, store: GitContactStore): void {
  server.registerTool('import_contacts', {
    description: 'Bulk import contacts from a vCard (.vcf) file. Returns import summary.',
    inputSchema: {
      filePath: z.string().describe('Path to .vcf file to import'),
      dryRun: z.boolean().optional().default(false).describe('Preview imports without committing'),
      skipDuplicates: z.boolean().optional().default(true).describe('Skip contacts that appear to be duplicates of existing ones'),
    },
  }, async ({ filePath, dryRun, skipDuplicates }) => {
    try {
      const result = await importVCardFile(store, filePath, { dryRun, skipDuplicates });

      if (result.dryRun) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              dryRun: true,
              totalParsed: result.totalParsed,
              wouldImport: result.contacts?.length ?? 0,
              wouldSkipDuplicates: result.skippedDuplicates,
              contacts: result.contacts,
            }, null, 2),
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            imported: result.imported,
            skippedDuplicates: result.skippedDuplicates,
            totalParsed: result.totalParsed,
            message: `Imported ${result.imported} contacts from ${filePath}`,
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
