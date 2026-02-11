import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Contact, ContactSummary, HistoryEntry, CommitInfo } from '../types/index.js';
import { toSummary } from '../types/index.js';
import { contactToVCard, vcardToContact } from '../contacts/vcard.js';
import { normalizeContact } from '../contacts/normalize.js';
import { createContact } from '../contacts/model.js';
import { generateId, ContactNotFoundError, StoreError, logger } from '../utils/index.js';
import { GitOps } from './git-ops.js';
import {
  contactPath, archivePath, relativeContactPath, relativeArchivePath,
  extractIdFromPath, CONTACTS_DIR, ARCHIVE_DIR,
} from './file-layout.js';

export class GitContactStore {
  private git: GitOps;
  private storePath: string;
  private lockFile: string;

  constructor(storePath: string) {
    this.storePath = storePath;
    this.git = new GitOps(storePath);
    this.lockFile = path.join(storePath, '.lock');
  }

  async init(): Promise<void> {
    await this.git.init();
  }

  // --- Locking ---

  private async acquireLock(): Promise<void> {
    try {
      await fs.writeFile(this.lockFile, process.pid.toString(), { flag: 'wx' });
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        // Check if lock is stale (> 30 seconds old)
        try {
          const stat = await fs.stat(this.lockFile);
          if (Date.now() - stat.mtimeMs > 30000) {
            await fs.unlink(this.lockFile);
            await fs.writeFile(this.lockFile, process.pid.toString(), { flag: 'wx' });
            return;
          }
        } catch { /* ignore */ }
        throw new StoreError('Store is locked by another operation');
      }
      throw err;
    }
  }

  private async releaseLock(): Promise<void> {
    try { await fs.unlink(this.lockFile); } catch { /* ignore */ }
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireLock();
    try {
      return await fn();
    } finally {
      await this.releaseLock();
    }
  }

  // --- CRUD ---

  async create(fields: Partial<Contact> & { fullName: string }): Promise<Contact> {
    return this.withLock(async () => {
      const contact = normalizeContact(createContact({
        ...fields,
        id: fields.id ?? generateId(),
      }));

      const vcard = contactToVCard(contact);
      const filePath = contactPath(this.storePath, contact.id);
      await fs.writeFile(filePath, vcard, 'utf-8');

      await this.git.add(relativeContactPath(contact.id));
      await this.git.commit(`Create contact: ${contact.fullName} (${contact.id})`);

      logger.info('Created contact:', contact.id, contact.fullName);
      return contact;
    });
  }

  async get(id: string): Promise<Contact> {
    // Check contacts/ first, then archive/
    for (const filePath of [contactPath(this.storePath, id), archivePath(this.storePath, id)]) {
      try {
        const vcard = await fs.readFile(filePath, 'utf-8');
        return vcardToContact(vcard);
      } catch (err: any) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
    throw new ContactNotFoundError(id);
  }

  async update(id: string, updates: Partial<Omit<Contact, 'id' | 'metadata'>>): Promise<Contact> {
    return this.withLock(async () => {
      const existing = await this.get(id);
      const changedFields: string[] = [];

      // Apply updates
      if (updates.fullName !== undefined && updates.fullName !== existing.fullName) {
        existing.fullName = updates.fullName;
        changedFields.push('name');
      }
      if (updates.name !== undefined) {
        existing.name = { ...existing.name, ...updates.name };
        if (!changedFields.includes('name')) changedFields.push('name');
      }
      if (updates.emails !== undefined) {
        existing.emails = updates.emails;
        changedFields.push('emails');
      }
      if (updates.phones !== undefined) {
        existing.phones = updates.phones;
        changedFields.push('phones');
      }
      if (updates.addresses !== undefined) {
        existing.addresses = updates.addresses;
        changedFields.push('addresses');
      }
      if (updates.organization !== undefined) {
        existing.organization = updates.organization;
        changedFields.push('organization');
      }
      if (updates.birthday !== undefined) {
        existing.birthday = updates.birthday;
        changedFields.push('birthday');
      }
      if (updates.anniversary !== undefined) {
        existing.anniversary = updates.anniversary;
        changedFields.push('anniversary');
      }
      if (updates.urls !== undefined) {
        existing.urls = updates.urls;
        changedFields.push('urls');
      }
      if (updates.notes !== undefined) {
        existing.notes = updates.notes;
        changedFields.push('notes');
      }
      if (updates.categories !== undefined) {
        existing.categories = updates.categories;
        changedFields.push('categories');
      }
      if (updates.photo !== undefined) {
        existing.photo = updates.photo;
        changedFields.push('photo');
      }

      existing.metadata.modified = new Date().toISOString();
      const normalized = normalizeContact(existing);

      const vcard = contactToVCard(normalized);
      await fs.writeFile(contactPath(this.storePath, id), vcard, 'utf-8');

      await this.git.add(relativeContactPath(id));
      const fieldList = changedFields.length > 0 ? changedFields.join(', ') : 'metadata';
      await this.git.commit(`Update contact: ${normalized.fullName} - changed ${fieldList}`);

      logger.info('Updated contact:', id, 'fields:', fieldList);
      return normalized;
    });
  }

  async delete(id: string, permanent: boolean = false): Promise<void> {
    return this.withLock(async () => {
      const contact = await this.get(id);

      if (permanent) {
        // Hard delete - remove file entirely
        try {
          await this.git.remove(relativeContactPath(id));
        } catch {
          await this.git.remove(relativeArchivePath(id));
        }
        await this.git.commit(`Delete contact permanently: ${contact.fullName} (${id})`);
      } else {
        // Soft delete - move to archive
        await this.git.move(relativeContactPath(id), relativeArchivePath(id));
        await this.git.commit(`Archive contact: ${contact.fullName} (${id})`);
      }

      logger.info(permanent ? 'Deleted' : 'Archived', 'contact:', id, contact.fullName);
    });
  }

  async list(includeArchived: boolean = false): Promise<Contact[]> {
    const contacts: Contact[] = [];

    // Read active contacts
    const contactsDir = path.join(this.storePath, CONTACTS_DIR);
    try {
      const files = await fs.readdir(contactsDir);
      for (const file of files) {
        if (!file.endsWith('.vcf')) continue;
        const vcard = await fs.readFile(path.join(contactsDir, file), 'utf-8');
        contacts.push(vcardToContact(vcard));
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    // Optionally include archived
    if (includeArchived) {
      const archiveDir = path.join(this.storePath, ARCHIVE_DIR);
      try {
        const files = await fs.readdir(archiveDir);
        for (const file of files) {
          if (!file.endsWith('.vcf')) continue;
          const vcard = await fs.readFile(path.join(archiveDir, file), 'utf-8');
          const contact = vcardToContact(vcard);
          contact.metadata.archived = true;
          contacts.push(contact);
        }
      } catch (err: any) {
        if (err.code !== 'ENOENT') throw err;
      }
    }

    return contacts;
  }

  async listSummaries(includeArchived: boolean = false): Promise<ContactSummary[]> {
    const contacts = await this.list(includeArchived);
    return contacts.map(toSummary);
  }

  // --- Bulk Operations ---

  async bulkCreate(contacts: (Partial<Contact> & { fullName: string })[], source?: string): Promise<{ created: number; ids: string[] }> {
    return this.withLock(async () => {
      const timestamp = Date.now();
      await this.git.tag(`pre-import-${timestamp}`);

      const ids: string[] = [];
      const paths: string[] = [];

      for (const fields of contacts) {
        const contact = normalizeContact(createContact({
          ...fields,
          id: fields.id ?? generateId(),
          metadata: {
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            source,
            providerIds: fields.metadata?.providerIds ?? {},
            archived: false,
          },
        }));

        const vcard = contactToVCard(contact);
        await fs.writeFile(contactPath(this.storePath, contact.id), vcard, 'utf-8');
        paths.push(relativeContactPath(contact.id));
        ids.push(contact.id);
      }

      await this.git.addMultiple(paths);
      await this.git.commit(`Import ${contacts.length} contacts${source ? ` from ${source}` : ''}`);
      await this.git.tag(`post-import-${timestamp}`);

      logger.info('Bulk created', contacts.length, 'contacts');
      return { created: contacts.length, ids };
    });
  }

  // --- History ---

  async getHistory(limit: number = 20, contactId?: string): Promise<HistoryEntry[]> {
    const file = contactId
      ? relativeContactPath(contactId)
      : undefined;

    let logResult;
    try {
      logResult = await this.git.log({ file, maxCount: limit });
    } catch {
      return [];
    }

    return logResult.all.map(entry => {
      const commitInfo: CommitInfo = {
        hash: entry.hash,
        message: entry.message,
        date: entry.date,
        author: entry.author_name,
      };

      // Parse operation from commit message
      const operation = parseOperation(entry.message);
      const extractedId = extractContactIdFromMessage(entry.message);

      return {
        commit: commitInfo,
        contactId: contactId ?? extractedId,
        operation,
        summary: entry.message,
      };
    });
  }

  // --- Rollback ---

  async rollback(options: {
    mode: 'last-n' | 'to-commit' | 'to-tag';
    count?: number;
    commitHash?: string;
    tagName?: string;
    dryRun?: boolean;
  }): Promise<{ revertedCommits: number; safetyTag: string }> {
    return this.withLock(async () => {
      const safetyTag = `pre-rollback-${Date.now()}`;
      await this.git.tag(safetyTag);

      if (options.dryRun) {
        return { revertedCommits: 0, safetyTag };
      }

      let revertedCommits = 0;

      switch (options.mode) {
        case 'last-n': {
          const count = options.count ?? 1;
          const log = await this.git.log({ maxCount: count });
          // Revert from newest to oldest
          for (const entry of log.all) {
            try {
              await this.git.revert(entry.hash);
              revertedCommits++;
            } catch (err) {
              logger.error('Failed to revert commit:', entry.hash, err);
              break;
            }
          }
          break;
        }
        case 'to-commit': {
          if (!options.commitHash) throw new StoreError('commitHash required for to-commit mode');
          const log = await this.git.log({ maxCount: 100 });
          for (const entry of log.all) {
            if (entry.hash === options.commitHash || entry.hash.startsWith(options.commitHash)) break;
            try {
              await this.git.revert(entry.hash);
              revertedCommits++;
            } catch (err) {
              logger.error('Failed to revert commit:', entry.hash, err);
              break;
            }
          }
          break;
        }
        case 'to-tag': {
          if (!options.tagName) throw new StoreError('tagName required for to-tag mode');
          // Resolve tag to commit, then same as to-commit
          // For now we use the tag name directly in revert range
          const log = await this.git.log({ maxCount: 100 });
          const tags = await this.git.listTags();
          if (!tags.includes(options.tagName)) {
            throw new StoreError(`Tag not found: ${options.tagName}`);
          }
          // Revert all commits since the tag
          for (const entry of log.all) {
            try {
              await this.git.revert(entry.hash);
              revertedCommits++;
            } catch {
              break; // Reached the tagged commit
            }
          }
          break;
        }
      }

      logger.info('Rolled back', revertedCommits, 'commits, safety tag:', safetyTag);
      return { revertedCommits, safetyTag };
    });
  }

  // --- Merge support ---

  async mergeAndArchive(
    primaryId: string,
    secondaryIds: string[],
    mergedContact: Contact,
  ): Promise<string> {
    return this.withLock(async () => {
      // Write merged contact
      const vcard = contactToVCard(mergedContact);
      await fs.writeFile(contactPath(this.storePath, primaryId), vcard, 'utf-8');

      const paths = [relativeContactPath(primaryId)];

      // Archive secondary contacts
      for (const secId of secondaryIds) {
        try {
          await fs.rename(
            contactPath(this.storePath, secId),
            archivePath(this.storePath, secId),
          );
          paths.push(relativeContactPath(secId));
          paths.push(relativeArchivePath(secId));
        } catch (err: any) {
          if (err.code !== 'ENOENT') throw err;
        }
      }

      await this.git.addMultiple(paths);
      const names = [mergedContact.fullName, ...secondaryIds].join(' + ');
      const hash = await this.git.commit(`Merge contacts: ${names} -> ${mergedContact.fullName}`);

      // Update merge log
      await this.updateMergeLog(primaryId, secondaryIds);

      logger.info('Merged contacts:', primaryId, '+', secondaryIds.join(', '));
      return hash;
    });
  }

  private async updateMergeLog(primaryId: string, secondaryIds: string[]): Promise<void> {
    const logPath = path.join(this.storePath, '.metadata', 'merge-log.json');
    let log: any[] = [];
    try {
      const raw = await fs.readFile(logPath, 'utf-8');
      log = JSON.parse(raw);
    } catch { /* new log */ }

    log.push({
      timestamp: new Date().toISOString(),
      primaryId,
      secondaryIds,
    });

    await fs.writeFile(logPath, JSON.stringify(log, null, 2), 'utf-8');
  }

  get gitOps(): GitOps {
    return this.git;
  }
}

// --- Helpers ---

function parseOperation(message: string): HistoryEntry['operation'] {
  const lower = message.toLowerCase();
  if (lower.startsWith('create')) return 'create';
  if (lower.startsWith('update')) return 'update';
  if (lower.startsWith('archive') || lower.startsWith('delete')) return 'delete';
  if (lower.startsWith('merge')) return 'merge';
  if (lower.startsWith('import')) return 'import';
  if (lower.startsWith('sync')) return 'sync';
  if (lower.startsWith('revert') || lower.startsWith('rollback')) return 'rollback';
  return 'update';
}

function extractContactIdFromMessage(message: string): string | undefined {
  const match = message.match(/\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/);
  return match?.[1];
}
