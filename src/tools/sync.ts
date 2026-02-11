import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';

export function registerSyncTool(server: McpServer, _store: GitContactStore): void {
  server.registerTool('sync_provider', {
    description: 'Synchronize contacts with a remote provider. Pulls new/changed contacts and pushes local changes.',
    inputSchema: {
      provider: z.string().describe('Provider name (e.g., "google-personal", "fastmail")'),
      direction: z.enum(['pull', 'push', 'both']).optional().default('both'),
      conflictStrategy: z.enum(['local-wins', 'remote-wins', 'newest-wins', 'manual']).optional().default('newest-wins'),
      dryRun: z.boolean().optional().default(false),
    },
  }, async ({ provider, direction, conflictStrategy, dryRun }) => {
    // TODO: Implement when providers and sync engine are ready
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          message: `Sync with provider "${provider}" is not yet configured. Set up providers in ~/.contacts-mcp/config.json`,
          provider,
          direction,
          conflictStrategy,
          dryRun,
        }, null, 2),
      }],
    };
  });
}
