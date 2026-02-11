/** All logging goes to stderr to avoid corrupting stdio MCP transport on stdout. */
export const logger = {
  info: (...args: unknown[]) => console.error('[INFO]', ...args),
  warn: (...args: unknown[]) => console.error('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
  debug: (...args: unknown[]) => {
    if (process.env.DEBUG) console.error('[DEBUG]', ...args);
  },
};
