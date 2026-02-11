import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { GitOps } from '../../src/store/git-ops.js';

let gitOps: GitOps;
let storePath: string;

beforeEach(async () => {
  storePath = await fs.mkdtemp(path.join(os.tmpdir(), 'contacts-mcp-git-'));
  gitOps = new GitOps(storePath);
  await gitOps.init();
});

afterEach(async () => {
  await fs.rm(storePath, { recursive: true, force: true });
});

describe('GitOps', () => {
  describe('init', () => {
    it('should create the directory structure', async () => {
      const dirs = await fs.readdir(storePath);
      expect(dirs).toContain('contacts');
      expect(dirs).toContain('archive');
      expect(dirs).toContain('.metadata');
      expect(dirs).toContain('.git');
    });

    it('should have an initial commit', async () => {
      const log = await gitOps.log({ maxCount: 1 });
      expect(log.all).toHaveLength(1);
      expect(log.all[0].message).toBe('Initial commit');
    });

    it('should not re-initialize on second call', async () => {
      // Write a file so we can verify it survives
      await fs.writeFile(path.join(storePath, 'contacts', 'test.txt'), 'hello');
      await gitOps.init(); // second call
      const content = await fs.readFile(path.join(storePath, 'contacts', 'test.txt'), 'utf-8');
      expect(content).toBe('hello');
    });
  });

  describe('add + commit', () => {
    it('should track a file and return commit hash', async () => {
      await fs.writeFile(path.join(storePath, 'contacts', 'test.vcf'), 'data');
      await gitOps.add('contacts/test.vcf');
      const hash = await gitOps.commit('Add test file');

      expect(hash).toBeTruthy();
      expect(hash.length).toBeGreaterThan(0);
    });
  });

  describe('log', () => {
    it('should return commit history', async () => {
      await fs.writeFile(path.join(storePath, 'contacts', 'a.vcf'), 'data-a');
      await gitOps.add('contacts/a.vcf');
      await gitOps.commit('Commit A');

      await fs.writeFile(path.join(storePath, 'contacts', 'b.vcf'), 'data-b');
      await gitOps.add('contacts/b.vcf');
      await gitOps.commit('Commit B');

      const log = await gitOps.log({ maxCount: 10 });
      // Initial commit + A + B = 3
      expect(log.all.length).toBe(3);
      expect(log.all[0].message).toBe('Commit B');
      expect(log.all[1].message).toBe('Commit A');
    });

    it('should scope log to a specific file', async () => {
      await fs.writeFile(path.join(storePath, 'contacts', 'a.vcf'), 'data-a');
      await gitOps.add('contacts/a.vcf');
      await gitOps.commit('Commit A');

      await fs.writeFile(path.join(storePath, 'contacts', 'b.vcf'), 'data-b');
      await gitOps.add('contacts/b.vcf');
      await gitOps.commit('Commit B');

      const log = await gitOps.log({ file: 'contacts/a.vcf', maxCount: 10 });
      expect(log.all).toHaveLength(1);
      expect(log.all[0].message).toBe('Commit A');
    });
  });

  describe('tag', () => {
    it('should create a tag', async () => {
      await gitOps.tag('test-tag-1');
      const tags = await gitOps.listTags();
      expect(tags).toContain('test-tag-1');
    });
  });

  describe('move', () => {
    it('should move a file and stage both paths', async () => {
      await fs.writeFile(path.join(storePath, 'contacts', 'file.vcf'), 'data');
      await gitOps.add('contacts/file.vcf');
      await gitOps.commit('Add file');

      await gitOps.move('contacts/file.vcf', 'archive/file.vcf');
      await gitOps.commit('Move to archive');

      // Original should not exist
      await expect(fs.access(path.join(storePath, 'contacts', 'file.vcf'))).rejects.toThrow();
      // New location should exist
      const content = await fs.readFile(path.join(storePath, 'archive', 'file.vcf'), 'utf-8');
      expect(content).toBe('data');
    });
  });

  describe('revert', () => {
    it('should revert a commit', async () => {
      await fs.writeFile(path.join(storePath, 'contacts', 'file.vcf'), 'original');
      await gitOps.add('contacts/file.vcf');
      await gitOps.commit('Add file');

      await fs.writeFile(path.join(storePath, 'contacts', 'file.vcf'), 'changed');
      await gitOps.add('contacts/file.vcf');
      await gitOps.commit('Change file');

      const log = await gitOps.log({ maxCount: 1 });
      await gitOps.revert(log.all[0].hash);

      const content = await fs.readFile(path.join(storePath, 'contacts', 'file.vcf'), 'utf-8');
      expect(content).toBe('original');
    });
  });

  describe('head', () => {
    it('should return the current HEAD hash', async () => {
      const head = await gitOps.head();
      expect(head).toBeTruthy();
      expect(head.length).toBeGreaterThanOrEqual(7);
    });
  });
});
