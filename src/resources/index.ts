import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';
import { findDuplicates } from '../contacts/index.js';

export function registerAllResources(server: McpServer, store: GitContactStore): void {
  // contacts://all - summary list of all contacts
  server.registerResource('all-contacts', 'contacts://all', {
    title: 'All Contacts',
    description: 'Summary list of all active contacts',
    mimeType: 'application/json',
  }, async (uri) => {
    const summaries = await store.listSummaries(false);
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(summaries, null, 2),
        mimeType: 'application/json',
      }],
    };
  });

  // contacts://{id} - individual contact detail
  server.registerResource('contact-detail',
    new ResourceTemplate('contacts://{id}', {
      list: async () => {
        const summaries = await store.listSummaries(false);
        return {
          resources: summaries.map(s => ({
            uri: `contacts://${s.id}`,
            name: s.fullName,
            mimeType: 'application/json',
          })),
        };
      },
    }),
    {
      title: 'Contact Detail',
      description: 'Full details for a specific contact',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const id = variables.id as string;
      const contact = await store.get(id);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(contact, null, 2),
          mimeType: 'application/json',
        }],
      };
    },
  );

  // contacts://duplicates - current duplicate candidates
  server.registerResource('duplicates', 'contacts://duplicates', {
    title: 'Duplicate Candidates',
    description: 'Potential duplicate contact pairs with confidence scores',
    mimeType: 'application/json',
  }, async (uri) => {
    const contacts = await store.list(false);
    const candidates = findDuplicates(contacts, { threshold: 0.6, limit: 50 });
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(candidates, null, 2),
        mimeType: 'application/json',
      }],
    };
  });

  // contacts://history - recent changes
  server.registerResource('history', 'contacts://history', {
    title: 'Recent Changes',
    description: 'Recent contact change history from git log',
    mimeType: 'application/json',
  }, async (uri) => {
    const entries = await store.getHistory(20);
    return {
      contents: [{
        uri: uri.href,
        text: JSON.stringify(entries, null, 2),
        mimeType: 'application/json',
      }],
    };
  });
}
