import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';

export function registerProvidersTool(server: McpServer, _store: GitContactStore): void {
  server.registerTool('list_providers', {
    description: 'List all configured contact providers and their sync status.',
  }, async () => {
    // TODO: Load from config when providers are implemented
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          providers: [
            {
              name: 'local',
              type: 'local',
              configured: true,
              lastSync: null,
              description: 'Local git-backed contact store (always available)',
            },
          ],
          message: 'Configure additional providers (Google, Apple, CardDAV) in ~/.contacts-mcp/config.json',
        }, null, 2),
      }],
    };
  });
}
