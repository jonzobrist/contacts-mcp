import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';

const emailSchema = z.object({
  value: z.string(),
  type: z.enum(['home', 'work', 'other']).optional(),
  primary: z.boolean().optional(),
});

const phoneSchema = z.object({
  value: z.string(),
  type: z.enum(['home', 'work', 'mobile', 'fax', 'other']).optional(),
  primary: z.boolean().optional(),
});

const addressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  type: z.enum(['home', 'work', 'other']).optional(),
});

export function registerCreateTool(server: McpServer, store: GitContactStore): void {
  server.registerTool('create_contact', {
    description: 'Create a new contact. At minimum, provide a full name. Returns the new contact.',
    inputSchema: {
      fullName: z.string().describe('Full display name'),
      givenName: z.string().optional(),
      familyName: z.string().optional(),
      emails: z.array(emailSchema).optional(),
      phones: z.array(phoneSchema).optional(),
      addresses: z.array(addressSchema).optional(),
      organization: z.object({
        name: z.string().optional(),
        title: z.string().optional(),
        department: z.string().optional(),
      }).optional(),
      birthday: z.string().optional().describe('YYYY-MM-DD format'),
      notes: z.string().optional(),
      categories: z.array(z.string()).optional(),
    },
  }, async (args) => {
    const contact = await store.create({
      fullName: args.fullName,
      name: {
        givenName: args.givenName,
        familyName: args.familyName,
      },
      emails: args.emails,
      phones: args.phones,
      addresses: args.addresses,
      organization: args.organization,
      birthday: args.birthday,
      notes: args.notes,
      categories: args.categories,
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ id: contact.id, fullName: contact.fullName, message: 'Contact created successfully' }, null, 2),
      }],
    };
  });
}
