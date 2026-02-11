import type { Contact, ContactProvider } from '../types/index.js';
import { ProviderError } from '../utils/index.js';

/**
 * Base class for contact providers with common utility methods.
 */
export abstract class BaseProvider implements ContactProvider {
  abstract readonly name: string;
  abstract readonly type: 'google' | 'apple' | 'carddav' | 'local';

  protected config: Record<string, unknown>;
  private _lastSyncTime: string | null = null;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
  }

  abstract isConfigured(): Promise<boolean>;
  abstract fetchAll(): Promise<Contact[]>;
  abstract fetchOne(remoteId: string): Promise<Contact | null>;
  abstract pushContact(contact: Contact): Promise<string>;
  abstract updateContact(remoteId: string, contact: Contact): Promise<void>;
  abstract deleteContact(remoteId: string): Promise<void>;

  async getLastSyncTime(): Promise<string | null> {
    return this._lastSyncTime;
  }

  async setLastSyncTime(time: string): Promise<void> {
    this._lastSyncTime = time;
  }

  protected assertConfigured(field: string): string {
    const value = this.config[field];
    if (!value || typeof value !== 'string') {
      throw new ProviderError(this.name, `Missing required config: ${field}`);
    }
    return value;
  }
}
