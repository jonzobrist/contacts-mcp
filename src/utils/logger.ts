/** All logging goes to stderr to avoid corrupting stdio MCP transport on stdout. */
let debugEnabled = Boolean(process.env.DEBUG);

/** Enable/disable debug logging. Called from config.json's `debug` field or the CLI's --debug flag. */
export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}

export function isDebugEnabled(): boolean {
  return debugEnabled;
}

export const logger = {
  info: (...args: unknown[]) => console.error('[INFO]', ...args),
  warn: (...args: unknown[]) => console.error('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
  debug: (...args: unknown[]) => {
    if (debugEnabled) console.error('[DEBUG]', ...args);
  },
};
