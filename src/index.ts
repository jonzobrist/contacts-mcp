#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { logger } from './utils/index.js';

async function main() {
  const config = await loadConfig();
  const { server, store } = createServer(config);

  await store.init();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('contacts-mcp server running on stdio');
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
