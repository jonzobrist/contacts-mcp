import type { Contact } from '../types/index.js';
import { BaseProvider } from './base.js';
import type { GitContactStore } from '../store/index.js';

/**
 * Local provider wrapping the git-backed store directly.
 * This is always available and doesn't require external configuration.
 */
export class LocalProvider extends BaseProvider {
  readonly name = 'local';
  readonly type = 'local' as const;
  private store: GitContactStore;

  constructor(store: GitContactStore) {
    super({});
    this.store = store;
  }

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async fetchAll(): Promise<Contact[]> {
    return this.store.list(false);
  }

  async fetchOne(remoteId: string): Promise<Contact | null> {
    try {
      return await this.store.get(remoteId);
    } catch {
      return null;
    }
  }

  async pushContact(contact: Contact): Promise<string> {
    const created = await this.store.create(contact);
    return created.id;
  }

  async updateContact(remoteId: string, contact: Contact): Promise<void> {
    await this.store.update(remoteId, contact);
  }

  async deleteContact(remoteId: string): Promise<void> {
    await this.store.delete(remoteId, false);
  }
}
