import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createTestStore } from '../helpers.js';
import type { GitContactStore } from '../../src/store/git-store.js';

let store: GitContactStore;
let storePath: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  const result = await createTestStore();
  store = result.store;
  storePath = result.storePath;
  cleanup = result.cleanup;
});

afterEach(async () => {
  await cleanup();
});

describe('GitContactStore', () => {
  describe('create', () => {
    it('should create a contact and write a .vcf file', async () => {
      const contact = await store.create({ fullName: 'Jane Smith' });

      expect(contact.id).toBeTruthy();
      expect(contact.fullName).toBe('Jane Smith');
      expect(contact.name.givenName).toBe('Jane');
      expect(contact.name.familyName).toBe('Smith');

      const filePath = path.join(storePath, 'contacts', `${contact.id}.vcf`);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('BEGIN:VCARD');
      expect(content).toContain('FN:Jane Smith');
    });

    it('should create a git commit', async () => {
      const contact = await store.create({ fullName: 'Bob Johnson' });
      const history = await store.getHistory(1);

      expect(history).toHaveLength(1);
      expect(history[0].operation).toBe('create');
      expect(history[0].summary).toContain('Bob Johnson');
      expect(history[0].summary).toContain(contact.id);
    });

    it('should normalize phone numbers', async () => {
      const contact = await store.create({
        fullName: 'Test',
        phones: [{ value: '(555) 123-4567', type: 'mobile' }],
      });

      expect(contact.phones[0].value).toBe('+15551234567');
      expect(contact.phones[0].originalValue).toBe('(555) 123-4567');
    });

    it('should normalize emails', async () => {
      const contact = await store.create({
        fullName: 'Test',
        emails: [{ value: 'JANE@Example.COM' }],
      });

      expect(contact.emails[0].value).toBe('jane@example.com');
    });
  });

  describe('get', () => {
    it('should retrieve a created contact', async () => {
      const created = await store.create({ fullName: 'Jane Smith' });
      const retrieved = await store.get(created.id);

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.fullName).toBe('Jane Smith');
    });

    it('should throw for non-existent contact', async () => {
      await expect(store.get('nonexistent-id')).rejects.toThrow('Contact not found');
    });

    it('should find archived contacts', async () => {
      const created = await store.create({ fullName: 'Archived Person' });
      await store.delete(created.id);
      const retrieved = await store.get(created.id);

      expect(retrieved.fullName).toBe('Archived Person');
    });
  });

  describe('update', () => {
    it('should update specific fields and preserve others', async () => {
      const created = await store.create({
        fullName: 'Jane Smith',
        emails: [{ value: 'jane@test.com' }],
        notes: 'Original note',
      });

      const updated = await store.update(created.id, {
        notes: 'Updated note',
      });

      expect(updated.notes).toBe('Updated note');
      expect(updated.emails[0].value).toBe('jane@test.com'); // preserved
      expect(updated.fullName).toBe('Jane Smith'); // preserved
    });

    it('should create a descriptive git commit', async () => {
      const created = await store.create({ fullName: 'Jane' });
      await store.update(created.id, { notes: 'new' });

      const history = await store.getHistory(1);
      expect(history[0].operation).toBe('update');
      expect(history[0].summary).toContain('notes');
    });

    it('should update modified timestamp', async () => {
      const created = await store.create({ fullName: 'Jane' });
      const origModified = created.metadata.modified;

      // Small delay to ensure different timestamp
      await new Promise(r => setTimeout(r, 10));
      const updated = await store.update(created.id, { notes: 'changed' });

      expect(updated.metadata.modified).not.toBe(origModified);
    });
  });

  describe('delete', () => {
    it('should soft-delete by moving to archive', async () => {
      const created = await store.create({ fullName: 'To Archive' });
      await store.delete(created.id);

      // Should not exist in contacts/
      const contactsDir = path.join(storePath, 'contacts');
      const files = await fs.readdir(contactsDir);
      expect(files.find(f => f.includes(created.id))).toBeUndefined();

      // Should exist in archive/
      const archiveDir = path.join(storePath, 'archive');
      const archiveFiles = await fs.readdir(archiveDir);
      expect(archiveFiles.find(f => f.includes(created.id))).toBeTruthy();
    });

    it('should permanent-delete by removing the file', async () => {
      const created = await store.create({ fullName: 'To Delete' });
      await store.delete(created.id, true);

      // Should not exist anywhere (git rm may remove empty parent directories)
      const contactsDir = path.join(storePath, 'contacts');
      const archiveDir = path.join(storePath, 'archive');
      let cFiles: string[] = [];
      let aFiles: string[] = [];
      try { cFiles = await fs.readdir(contactsDir); } catch (err: any) { if (err.code !== 'ENOENT') throw err; }
      try { aFiles = await fs.readdir(archiveDir); } catch (err: any) { if (err.code !== 'ENOENT') throw err; }
      expect(cFiles.find(f => f.includes(created.id))).toBeUndefined();
      expect(aFiles.find(f => f.includes(created.id))).toBeUndefined();
    });

    it('should create a git commit for archive', async () => {
      const created = await store.create({ fullName: 'Archived' });
      await store.delete(created.id);

      const history = await store.getHistory(1);
      expect(history[0].operation).toBe('delete');
      expect(history[0].summary).toContain('Archive');
    });
  });

  describe('list', () => {
    it('should list all active contacts', async () => {
      await store.create({ fullName: 'Alice' });
      await store.create({ fullName: 'Bob' });
      await store.create({ fullName: 'Charlie' });

      const contacts = await store.list();
      expect(contacts).toHaveLength(3);
    });

    it('should not include archived contacts by default', async () => {
      const c = await store.create({ fullName: 'Archived' });
      await store.create({ fullName: 'Active' });
      await store.delete(c.id);

      const contacts = await store.list();
      expect(contacts).toHaveLength(1);
      expect(contacts[0].fullName).toBe('Active');
    });

    it('should include archived contacts when requested', async () => {
      const c = await store.create({ fullName: 'Archived' });
      await store.create({ fullName: 'Active' });
      await store.delete(c.id);

      const contacts = await store.list(true);
      expect(contacts).toHaveLength(2);
    });
  });

  describe('listSummaries', () => {
    it('should return ContactSummary objects', async () => {
      await store.create({
        fullName: 'Jane Smith',
        emails: [{ value: 'jane@test.com' }],
        organization: { name: 'Acme' },
      });

      const summaries = await store.listSummaries();
      expect(summaries).toHaveLength(1);
      expect(summaries[0].fullName).toBe('Jane Smith');
      expect(summaries[0].primaryEmail).toBe('jane@test.com');
      expect(summaries[0].organization).toBe('Acme');
      expect(summaries[0].archived).toBe(false);
    });
  });

  describe('bulkCreate', () => {
    it('should create multiple contacts in a single commit', async () => {
      const result = await store.bulkCreate([
        { fullName: 'Bulk A' },
        { fullName: 'Bulk B' },
        { fullName: 'Bulk C' },
      ], 'test-import');

      expect(result.created).toBe(3);
      expect(result.ids).toHaveLength(3);

      const contacts = await store.list();
      expect(contacts).toHaveLength(3);

      // Should be a single import commit (+ initial + the import)
      const history = await store.getHistory(5);
      const importCommit = history.find(h => h.operation === 'import');
      expect(importCommit).toBeTruthy();
      expect(importCommit!.summary).toContain('3 contacts');
    });

    it('should create pre/post tags', async () => {
      await store.bulkCreate([{ fullName: 'Tagged' }], 'test');

      const tags = await store.gitOps.listTags();
      expect(tags.some(t => t.startsWith('pre-import-'))).toBe(true);
      expect(tags.some(t => t.startsWith('post-import-'))).toBe(true);
    });
  });

  describe('history', () => {
    it('should return global history', async () => {
      await store.create({ fullName: 'A' });
      await store.create({ fullName: 'B' });

      const history = await store.getHistory(10);
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should return per-contact history', async () => {
      const a = await store.create({ fullName: 'A' });
      await store.create({ fullName: 'B' });
      await store.update(a.id, { notes: 'updated' });

      const history = await store.getHistory(10, a.id);
      // Should have create + update for contact A
      expect(history.length).toBeGreaterThanOrEqual(1);
    });

    it('should parse operation types correctly', async () => {
      const c = await store.create({ fullName: 'Test' });
      await store.update(c.id, { notes: 'x' });
      await store.delete(c.id);

      const history = await store.getHistory(10);
      const ops = history.map(h => h.operation);
      expect(ops).toContain('create');
      expect(ops).toContain('update');
      expect(ops).toContain('delete');
    });
  });

  describe('rollback', () => {
    it('should revert the last commit', async () => {
      await store.create({ fullName: 'Keep' });
      const toRevert = await store.create({ fullName: 'Revert Me' });

      const result = await store.rollback({ mode: 'last-n', count: 1 });

      expect(result.revertedCommits).toBe(1);
      expect(result.safetyTag).toContain('pre-rollback-');

      const contacts = await store.list();
      expect(contacts).toHaveLength(1);
      expect(contacts[0].fullName).toBe('Keep');
    });

    it('should create a safety tag', async () => {
      await store.create({ fullName: 'Test' });
      const result = await store.rollback({ mode: 'last-n', count: 1 });

      const tags = await store.gitOps.listTags();
      expect(tags).toContain(result.safetyTag);
    });

    it('should support dry-run', async () => {
      await store.create({ fullName: 'Kept' });
      const result = await store.rollback({ mode: 'last-n', count: 1, dryRun: true });

      expect(result.revertedCommits).toBe(0);
      // Contact should still exist
      const contacts = await store.list();
      expect(contacts).toHaveLength(1);
    });
  });

  describe('mergeAndArchive', () => {
    it('should write merged contact and archive secondaries', async () => {
      const a = await store.create({ fullName: 'Jane A', emails: [{ value: 'a@test.com' }] });
      const b = await store.create({ fullName: 'Jane B', emails: [{ value: 'b@test.com' }] });

      // Build a merged contact
      const merged = { ...a, emails: [...a.emails, ...b.emails] };
      await store.mergeAndArchive(a.id, [b.id], merged);

      const contacts = await store.list(false);
      expect(contacts).toHaveLength(1);
      expect(contacts[0].emails).toHaveLength(2);

      // Secondary should be in archive
      const allContacts = await store.list(true);
      expect(allContacts).toHaveLength(2);
    });
  });
});
