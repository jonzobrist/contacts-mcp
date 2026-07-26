import * as fs from 'node:fs/promises';
import type { GitContactStore } from '../store/index.js';
import { vcardToContact } from './vcard.js';
import { findDuplicates } from './dedup.js';
import type { Contact } from '../types/index.js';
import { logger } from '../utils/index.js';

export interface ImportVCardOptions {
  dryRun?: boolean;
  skipDuplicates?: boolean;
}

export interface ImportVCardResult {
  dryRun: boolean;
  imported: number;
  skippedDuplicates: number;
  totalParsed: number;
  unparseable: number;
  contacts?: { fullName: string; emails: number; phones: number }[];
}

/** Parse a .vcf file and bulk-create contacts, logging progress along the way. */
export async function importVCardFile(
  store: GitContactStore,
  filePath: string,
  options: ImportVCardOptions = {},
): Promise<ImportVCardResult> {
  const { dryRun = false, skipDuplicates = true } = options;

  logger.info(`Reading ${filePath}`);
  const raw = await fs.readFile(filePath, 'utf-8');
  const vcards = splitVCards(raw);
  logger.info(`Found ${vcards.length} vCard entries`);

  const parsed: Contact[] = [];
  let unparseable = 0;
  for (const vcard of vcards) {
    try {
      parsed.push(vcardToContact(vcard));
    } catch (err: any) {
      unparseable++;
      logger.debug('Skipping unparseable vCard:', err.message);
    }
  }
  if (unparseable > 0) logger.warn(`Skipped ${unparseable} unparseable entr${unparseable === 1 ? 'y' : 'ies'}`);
  logger.info(`Parsed ${parsed.length} contacts`);

  let skippedDuplicates = 0;
  let toImport = parsed;

  if (skipDuplicates && !dryRun) {
    logger.info('Checking for duplicates against existing contacts...');
    const existing = await store.list(false);
    const combined = [...existing, ...parsed];
    const dupes = findDuplicates(combined, { threshold: 0.8 });
    const dupeIds = new Set<string>();
    for (const dupe of dupes) {
      const isNewA = parsed.some(p => p.id === dupe.contactA.id);
      const isNewB = parsed.some(p => p.id === dupe.contactB.id);
      if (isNewA && !isNewB) dupeIds.add(dupe.contactA.id);
      if (isNewB && !isNewA) dupeIds.add(dupe.contactB.id);
    }
    toImport = parsed.filter(c => !dupeIds.has(c.id));
    skippedDuplicates = parsed.length - toImport.length;
    logger.info(`${skippedDuplicates} likely duplicate(s) will be skipped`);
  }

  if (dryRun) {
    logger.info(`Dry run complete: would import ${toImport.length}, skip ${skippedDuplicates} duplicate(s)`);
    return {
      dryRun: true,
      imported: 0,
      skippedDuplicates,
      totalParsed: parsed.length,
      unparseable,
      contacts: toImport.map(c => ({ fullName: c.fullName, emails: c.emails.length, phones: c.phones.length })),
    };
  }

  logger.info(`Importing ${toImport.length} contacts...`);
  const result = await store.bulkCreate(toImport, `file:${filePath}`);
  logger.info(`Import complete: ${result.created} created, ${skippedDuplicates} duplicate(s) skipped, ${unparseable} unparseable`);

  return {
    dryRun: false,
    imported: result.created,
    skippedDuplicates,
    totalParsed: parsed.length,
    unparseable,
  };
}

/** Split a multi-contact vCard file into individual vCard strings. */
function splitVCards(raw: string): string[] {
  const cards: string[] = [];
  const lines = raw.split(/\r?\n/);
  let current: string[] = [];
  let inCard = false;

  for (const line of lines) {
    if (line.toUpperCase().startsWith('BEGIN:VCARD')) {
      inCard = true;
      current = [line];
    } else if (line.toUpperCase().startsWith('END:VCARD')) {
      current.push(line);
      if (inCard) cards.push(current.join('\r\n'));
      inCard = false;
      current = [];
    } else if (inCard) {
      current.push(line);
    }
  }

  return cards;
}
