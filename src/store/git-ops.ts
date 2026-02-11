import { simpleGit, type SimpleGit, type LogResult } from 'simple-git';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { logger } from '../utils/index.js';

export class GitOps {
  private git!: SimpleGit;
  readonly storePath: string;

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  /** Initialize the git repo and directory structure. */
  async init(): Promise<void> {
    // Create directories first so simpleGit can initialize
    await fs.mkdir(this.storePath, { recursive: true });
    await fs.mkdir(path.join(this.storePath, 'contacts'), { recursive: true });
    await fs.mkdir(path.join(this.storePath, 'archive'), { recursive: true });
    await fs.mkdir(path.join(this.storePath, '.metadata'), { recursive: true });

    this.git = simpleGit(this.storePath);

    // Check if already a git repo
    const isRepo = await this.git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      await this.git.init();
      // Create initial commit so git log doesn't fail
      const gitignorePath = path.join(this.storePath, '.gitignore');
      await fs.writeFile(gitignorePath, '.lock\n', 'utf-8');
      await this.git.add('.gitignore');
      await this.git.commit('Initial commit');
      logger.info('Initialized git repository at', this.storePath);
    }
  }

  async add(filePath: string): Promise<void> {
    await this.git.add(filePath);
  }

  async addMultiple(filePaths: string[]): Promise<void> {
    if (filePaths.length > 0) {
      await this.git.add(filePaths);
    }
  }

  async commit(message: string): Promise<string> {
    const result = await this.git.commit(message);
    return result.commit;
  }

  async log(options?: { file?: string; maxCount?: number }): Promise<LogResult> {
    const args: Record<string, unknown> = {};
    if (options?.maxCount) args['--max-count'] = options.maxCount;
    if (options?.file) args['--follow'] = null;

    if (options?.file) {
      return this.git.log({ file: options.file, ...args });
    }
    return this.git.log(args);
  }

  async revert(commitHash: string): Promise<void> {
    await this.git.revert(commitHash, { '--no-edit': null });
  }

  async tag(tagName: string): Promise<void> {
    await this.git.addTag(tagName);
  }

  async listTags(): Promise<string[]> {
    const result = await this.git.tags();
    return result.all;
  }

  /** Remove a file from the working tree and stage the removal. */
  async remove(filePath: string): Promise<void> {
    await this.git.rm(filePath);
  }

  /** Move/rename a file and stage it. */
  async move(from: string, to: string): Promise<void> {
    // Ensure destination directory exists
    await fs.mkdir(path.dirname(path.join(this.storePath, to)), { recursive: true });
    await fs.rename(
      path.join(this.storePath, from),
      path.join(this.storePath, to),
    );
    await this.git.add([from, to]);
  }

  /** Show file contents at a specific commit. */
  async showFileAtCommit(commitHash: string, filePath: string): Promise<string> {
    return this.git.show([`${commitHash}:${filePath}`]);
  }

  /** Get the current HEAD commit hash. */
  async head(): Promise<string> {
    const result = await this.git.revparse(['HEAD']);
    return result.trim();
  }

  /** Get diff between two refs. */
  async diff(refA: string, refB: string): Promise<string> {
    return this.git.diff([refA, refB]);
  }
}
