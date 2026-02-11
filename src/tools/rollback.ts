import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GitContactStore } from '../store/index.js';

export function registerRollbackTool(server: McpServer, store: GitContactStore): void {
  server.registerTool('rollback', {
    description: 'Undo recent changes by reverting git commits. Creates safety tags before reverting so the rollback itself can be undone.',
    inputSchema: {
      mode: z.enum(['last-n', 'to-commit', 'to-tag']).describe('Rollback mode'),
      count: z.number().optional().describe('Number of commits to revert (for "last-n", default 1)'),
      commitHash: z.string().optional().describe('Target commit hash (for "to-commit")'),
      tagName: z.string().optional().describe('Target tag name (for "to-tag")'),
      dryRun: z.boolean().optional().default(false).describe('Preview what would change without making changes'),
    },
  }, async (args) => {
    try {
      const result = await store.rollback({
        mode: args.mode,
        count: args.count,
        commitHash: args.commitHash,
        tagName: args.tagName,
        dryRun: args.dryRun,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ...result,
            message: args.dryRun
              ? `Dry run: would revert commits. Safety tag: ${result.safetyTag}`
              : `Reverted ${result.revertedCommits} commit(s). Safety tag: ${result.safetyTag} (use to-tag rollback to undo this rollback)`,
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
