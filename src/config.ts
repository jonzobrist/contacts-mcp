import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import type { ProviderConfig } from './types/index.js';

export interface AppConfig {
  storePath: string;
  providers: ProviderConfig[];
}

const DEFAULT_STORE_PATH = path.join(os.homedir(), '.contacts-mcp', 'store');

export async function loadConfig(): Promise<AppConfig> {
  const configPath = process.env.CONTACTS_MCP_CONFIG
    ?? path.join(os.homedir(), '.contacts-mcp', 'config.json');

  const storePath = process.env.CONTACTS_MCP_STORE ?? DEFAULT_STORE_PATH;

  let providers: ProviderConfig[] = [];

  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.storePath) {
      return {
        storePath: parsed.storePath,
        providers: parsed.providers ?? [],
      };
    }
    providers = parsed.providers ?? [];
  } catch {
    // No config file yet - that's fine, use defaults
  }

  return { storePath, providers };
}
