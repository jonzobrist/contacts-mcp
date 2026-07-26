import * as fs from 'node:fs/promises';
import { loadConfig } from './config.js';
import { GitContactStore } from './store/index.js';
import { resolveContactPoints, contactToVCard, importVCardFile } from './contacts/index.js';
import { SyncEngine } from './sync/engine.js';
import { AppleProvider } from './providers/apple.js';
import { GoogleProvider } from './providers/google.js';
import { CardDAVProvider } from './providers/carddav.js';
import type { ContactProvider, ProviderConfig } from './types/index.js';
import { logger } from './utils/index.js';

interface CliOptions {
  command: string;
  output?: string;
  input?: string;
  file?: string;
  provider?: string;
  direction: 'pull' | 'push' | 'both';
  conflictStrategy: 'local-wins' | 'remote-wins' | 'newest-wins' | 'manual';
  dryRun: boolean;
  includeArchived: boolean;
  defaultCountry: string;
  format: 'json' | 'csv' | 'vcf';
  skipDuplicates: boolean;
}

export async function maybeRunCli(argv: string[]): Promise<boolean> {
  const command = argv[2];
  if (!command || command === 'serve') return false;
  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return true;
  }
  if (!['export', 'resolve', 'sync-provider', 'import'].includes(command)) {
    logger.error(`Unknown command: "${command}". Run "contacts-mcp help" for usage.`);
    process.exit(1);
  }

  const options = parseOptions(argv.slice(2));
  logger.debug('Parsed CLI options:', options);

  const config = await loadConfig();
  logger.info(`Using store at ${config.storePath}`);
  const store = new GitContactStore(config.storePath);
  await store.init();

  if (options.command === 'export') {
    logger.info(`Exporting contacts (format: ${options.format})...`);
    const contacts = await store.list(options.includeArchived);
    logger.info(`Loaded ${contacts.length} contacts`);
    const output = formatContacts(contacts, options.format);
    await writeOutput(options.output, output);
    logger.info('Export complete');
    return true;
  }

  if (options.command === 'import') {
    if (!options.file) {
      throw new Error('import requires --file <path.vcf>');
    }
    const result = await importVCardFile(store, options.file, {
      dryRun: options.dryRun,
      skipDuplicates: options.skipDuplicates,
    });
    await writeOutput(options.output, JSON.stringify(result, null, 2));
    return true;
  }

  if (options.command === 'sync-provider') {
    logger.info(`Resolving provider "${options.provider ?? '(default)'}"...`);
    const provider = createProvider(config.providers, options.provider);
    const configured = await provider.isConfigured();
    if (!configured) {
      throw new Error(
        `Provider "${provider.name}" (${provider.type}) is not configured or accessible.`
        + (provider.type === 'apple'
          ? ' Grant Contacts access to your terminal in System Settings > Privacy & Security > Contacts.'
          : ' Check ~/.contacts-mcp/config.json.'),
      );
    }
    logger.info(`Syncing with "${provider.name}" (direction: ${options.direction}, conflict strategy: ${options.conflictStrategy}${options.dryRun ? ', dry-run' : ''})...`);
    const result = await new SyncEngine(store).sync(provider, {
      direction: options.direction,
      conflictStrategy: options.conflictStrategy,
      dryRun: options.dryRun,
    });
    logger.info(`Sync complete: pulled ${result.pulled}, pushed ${result.pushed}, conflicts ${result.conflicts}, errors ${result.errors.length}`);
    await writeOutput(options.output, JSON.stringify(result, null, 2));
    return true;
  }

  logger.info('Resolving contact points...');
  const input = await readInput(options.input);
  const contacts = await store.list(options.includeArchived);
  const result = resolveContactPoints(contacts, {
    emails: input.emails ?? [],
    phones: input.phones ?? [],
    defaultCountry: input.defaultCountry ?? options.defaultCountry,
  });
  await writeOutput(options.output, JSON.stringify(result, null, 2));
  return true;
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    command: args[0] ?? '',
    includeArchived: false,
    defaultCountry: 'US',
    format: 'json',
    direction: 'pull',
    conflictStrategy: 'newest-wins',
    dryRun: false,
    skipDuplicates: true,
  };

  // Allow `contacts-mcp import contacts.vcf` as shorthand for `--file contacts.vcf`
  if (options.command === 'import' && args[1] && !args[1].startsWith('-')) {
    options.file = args[1];
  }

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (i === 1 && options.file === arg) continue;
    switch (arg) {
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--input':
      case '-i':
        options.input = args[++i];
        break;
      case '--file':
      case '-f':
        options.file = args[++i];
        break;
      case '--allow-duplicates':
        options.skipDuplicates = false;
        break;
      case '--provider':
        options.provider = args[++i];
        break;
      case '--direction': {
        const direction = args[++i];
        if (direction !== 'pull' && direction !== 'push' && direction !== 'both') {
          throw new Error(`Unsupported sync direction: ${direction}`);
        }
        options.direction = direction;
        break;
      }
      case '--conflict-strategy': {
        const strategy = args[++i];
        if (
          strategy !== 'local-wins'
          && strategy !== 'remote-wins'
          && strategy !== 'newest-wins'
          && strategy !== 'manual'
        ) {
          throw new Error(`Unsupported conflict strategy: ${strategy}`);
        }
        options.conflictStrategy = strategy;
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--include-archived':
        options.includeArchived = true;
        break;
      case '--default-country':
        options.defaultCountry = args[++i] ?? 'US';
        break;
      case '--format': {
        const format = args[++i];
        if (format !== 'json' && format !== 'csv' && format !== 'vcf') {
          throw new Error(`Unsupported export format: ${format}`);
        }
        options.format = format;
        break;
      }
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function createProvider(
  providerConfigs: ProviderConfig[],
  providerName: string | undefined,
): ContactProvider {
  const configuredProviders = providerConfigs.filter(provider => provider.enabled !== false);
  const config = providerName
    ? configuredProviders.find(provider => provider.name === providerName)
    : configuredProviders.length === 1
      ? configuredProviders[0]
      : configuredProviders.find(provider => provider.type === 'apple');

  if (!config) {
    if (providerName === 'apple' || (!providerName && process.platform === 'darwin')) {
      return new AppleProvider('apple', {});
    }
    throw new Error(
      `Provider "${providerName ?? '(default)'}" not found. Configure providers in ~/.contacts-mcp/config.json`,
    );
  }

  switch (config.type) {
    case 'apple':
      return new AppleProvider(config.name, config.config ?? {});
    case 'google':
      return new GoogleProvider(config.name, config.config ?? {});
    case 'carddav':
      return new CardDAVProvider(config.name, config.config ?? {});
    default:
      throw new Error(`Unsupported provider type for sync: ${config.type}`);
  }
}

async function readInput(inputPath?: string): Promise<{
  emails?: string[];
  phones?: string[];
  defaultCountry?: string;
}> {
  const text = inputPath && inputPath !== '-'
    ? await fs.readFile(inputPath, 'utf-8')
    : await readStdin();
  return JSON.parse(text);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function writeOutput(outputPath: string | undefined, output: string): Promise<void> {
  if (!outputPath || outputPath === '-') {
    process.stdout.write(output);
    process.stdout.write('\n');
    return;
  }
  await fs.writeFile(outputPath, output, 'utf-8');
}

function formatContacts(
  contacts: Awaited<ReturnType<GitContactStore['list']>>,
  format: 'json' | 'csv' | 'vcf',
): string {
  if (format === 'json') return JSON.stringify(contacts, null, 2);
  if (format === 'vcf') return contacts.map(contactToVCard).join('\r\n');
  return contactsToCsv(contacts);
}

function contactsToCsv(contacts: Awaited<ReturnType<GitContactStore['list']>>): string {
  const headers = ['ID', 'Full Name', 'Email', 'Phone', 'Organization', 'Title'];
  const rows = contacts.map(c => [
    c.id,
    csvEscape(c.fullName),
    csvEscape(c.emails.map(e => e.value).join('; ')),
    csvEscape(c.phones.map(p => p.value).join('; ')),
    csvEscape(c.organization?.name ?? ''),
    csvEscape(c.organization?.title ?? ''),
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function printHelp(): void {
  process.stdout.write(`contacts-mcp

Usage:
  contacts-mcp serve
  contacts-mcp export [--format json|csv|vcf] [--output path|-] [--include-archived]
  contacts-mcp import <path.vcf> [--dry-run] [--allow-duplicates] [--output path|-]
  contacts-mcp resolve --input path|- [--output path|-] [--include-archived] [--default-country US]
  contacts-mcp sync-provider [--provider apple] [--direction pull|push|both] [--dry-run] [--output path|-]

Without a command, contacts-mcp starts the MCP stdio server (it will sit waiting
on stdin — if that's not what you wanted, check your command against the list above).

Set DEBUG=1 for verbose debug logging. All log output goes to stderr; only
command results go to stdout, so you can safely pipe/redirect stdout.
`);
}
