import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';

export function registerUpdateTool(server: McpServer, store: GitContactStore): void {
  server.registerTool('update_contact', {
    description: 'Update fields on an existing contact. Only provided fields are changed; omitted fields are preserved.',
    inputSchema: {
      id: z.string().describe('Contact UUID to update'),
      fullName: z.string().optional(),
      givenName: z.string().optional(),
      familyName: z.string().optional(),
      emails: z.array(z.object({
        value: z.string(),
        type: z.enum(['home', 'work', 'other']).optional(),
        primary: z.boolean().optional(),
      })).optional(),
      phones: z.array(z.object({
        value: z.string(),
        type: z.enum(['home', 'work', 'mobile', 'fax', 'other']).optional(),
        primary: z.boolean().optional(),
      })).optional(),
      addresses: z.array(z.object({
        street: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        country: z.string().optional(),
        type: z.enum(['home', 'work', 'other']).optional(),
      })).optional(),
      organization: z.object({
        name: z.string().optional(),
        title: z.string().optional(),
        department: z.string().optional(),
      }).optional(),
      birthday: z.string().optional(),
      notes: z.string().optional(),
      categories: z.array(z.string()).optional(),
    },
  }, async (args) => {
    try {
      const updates: Record<string, any> = {};
      if (args.fullName !== undefined) updates.fullName = args.fullName;
      if (args.givenName !== undefined || args.familyName !== undefined) {
        updates.name = {};
        if (args.givenName !== undefined) updates.name.givenName = args.givenName;
        if (args.familyName !== undefined) updates.name.familyName = args.familyName;
      }
      if (args.emails !== undefined) updates.emails = args.emails;
      if (args.phones !== undefined) updates.phones = args.phones;
      if (args.addresses !== undefined) updates.addresses = args.addresses;
      if (args.organization !== undefined) updates.organization = args.organization;
      if (args.birthday !== undefined) updates.birthday = args.birthday;
      if (args.notes !== undefined) updates.notes = args.notes;
      if (args.categories !== undefined) updates.categories = args.categories;

      const contact = await store.update(args.id, updates);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ id: contact.id, fullName: contact.fullName, message: 'Contact updated successfully' }, null, 2),
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
