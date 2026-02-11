import { z } from 'zod';
import * as fs from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';
import { vcardToContact } from '../contacts/index.js';
import { findDuplicates } from '../contacts/index.js';
import type { Contact } from '../types/index.js';

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
      const raw = await fs.readFile(filePath, 'utf-8');
      const vcards = splitVCards(raw);
      const parsed: Contact[] = [];

      for (const vcard of vcards) {
        try {
          parsed.push(vcardToContact(vcard));
        } catch (err: any) {
          // Skip unparseable entries
        }
      }

      let skippedDuplicates = 0;
      let toImport = parsed;

      if (skipDuplicates && !dryRun) {
        const existing = await store.list(false);
        const combined = [...existing, ...parsed];
        const dupes = findDuplicates(combined, { threshold: 0.8 });
        const dupeIds = new Set<string>();
        for (const dupe of dupes) {
          // If one of the pair is from the new import, skip it
          const isNewA = parsed.some(p => p.id === dupe.contactA.id);
          const isNewB = parsed.some(p => p.id === dupe.contactB.id);
          if (isNewA && !isNewB) dupeIds.add(dupe.contactA.id);
          if (isNewB && !isNewA) dupeIds.add(dupe.contactB.id);
        }
        toImport = parsed.filter(c => !dupeIds.has(c.id));
        skippedDuplicates = parsed.length - toImport.length;
      }

      if (dryRun) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              dryRun: true,
              totalParsed: parsed.length,
              wouldImport: toImport.length,
              wouldSkipDuplicates: skippedDuplicates,
              contacts: toImport.map(c => ({ fullName: c.fullName, emails: c.emails.length, phones: c.phones.length })),
            }, null, 2),
          }],
        };
      }

      const result = await store.bulkCreate(toImport, `file:${filePath}`);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            imported: result.created,
            skippedDuplicates,
            totalParsed: parsed.length,
            message: `Imported ${result.created} contacts from ${filePath}`,
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

/** Split a multi-contact vCard file into individual vCard strings. */
function splitVCards(raw: string): string[] {
  const cards: string[] = [];
  const lines = raw.split(/\r?\n/);
  let current: string[] = [];
  let inCard = false;

  for (const line of lines) {
    if (line.toUpperCase().startsWith('BEGIN:VCARD')) {
      inCard = true;
      current = [line];
    } else if (line.toUpperCase().startsWith('END:VCARD')) {
      current.push(line);
      if (inCard) cards.push(current.join('\r\n'));
      inCard = false;
      current = [];
    } else if (inCard) {
      current.push(line);
    }
  }

  return cards;
}
