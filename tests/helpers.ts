import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitContactStore } from '../src/store/git-store.js';
import type { Contact } from '../src/types/contact.js';

/** Create a temp directory with an initialized GitContactStore for testing. */
export async function createTestStore(): Promise<{ store: GitContactStore; storePath: string; cleanup: () => Promise<void> }> {
  const storePath = await fs.mkdtemp(path.join(os.tmpdir(), 'contacts-mcp-test-'));
  const store = new GitContactStore(storePath);
  await store.init();
  return {
    store,
    storePath,
    cleanup: async () => {
      await fs.rm(storePath, { recursive: true, force: true });
    },
  };
}

/** Build a minimal contact for testing. */
export function makeContact(overrides: Partial<Contact> & { fullName: string }): Partial<Contact> & { fullName: string } {
  return {
    fullName: overrides.fullName,
    emails: overrides.emails ?? [],
    phones: overrides.phones ?? [],
    addresses: overrides.addresses ?? [],
    categories: overrides.categories ?? [],
    ...overrides,
  };
}
