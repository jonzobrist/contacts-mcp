import { z } from 'zod';
import * as fs from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';
import { contactToVCard, searchContacts } from '../contacts/index.js';

export function registerExportTool(server: McpServer, store: GitContactStore): void {
  server.registerTool('export_contacts', {
    description: 'Export contacts to a file. Supports vCard (.vcf), CSV, and JSON formats.',
    inputSchema: {
      format: z.enum(['vcf', 'csv', 'json']).describe('Export format'),
      outputPath: z.string().describe('File path to write to'),
      filter: z.string().optional().describe('Optional search query to filter which contacts to export'),
      includeArchived: z.boolean().optional().default(false),
    },
  }, async ({ format, outputPath, filter, includeArchived }) => {
    try {
      let contacts = await store.list(includeArchived);

      if (filter) {
        const summaries = searchContacts(contacts, filter, contacts.length);
        const ids = new Set(summaries.map(s => s.id));
        contacts = contacts.filter(c => ids.has(c.id));
      }

      let output: string;

      switch (format) {
        case 'vcf':
          output = contacts.map(contactToVCard).join('\r\n');
          break;
        case 'csv':
          output = contactsToCsv(contacts);
          break;
        case 'json':
          output = JSON.stringify(contacts, null, 2);
          break;
      }

      await fs.writeFile(outputPath, output, 'utf-8');
      const stat = await fs.stat(outputPath);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            exported: contacts.length,
            format,
            filePath: outputPath,
            fileSize: stat.size,
            message: `Exported ${contacts.length} contacts to ${outputPath}`,
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

function contactsToCsv(contacts: import('../types/index.js').Contact[]): string {
  const headers = ['ID', 'Full Name', 'Given Name', 'Family Name', 'Email', 'Phone', 'Organization', 'Title', 'Birthday', 'Categories', 'Notes'];
  const rows = contacts.map(c => [
    c.id,
    csvEscape(c.fullName),
    csvEscape(c.name.givenName ?? ''),
    csvEscape(c.name.familyName ?? ''),
    csvEscape(c.emails.map(e => e.value).join('; ')),
    csvEscape(c.phones.map(p => p.value).join('; ')),
    csvEscape(c.organization?.name ?? ''),
    csvEscape(c.organization?.title ?? ''),
    c.birthday ?? '',
    csvEscape(c.categories.join('; ')),
    csvEscape(c.notes ?? ''),
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
