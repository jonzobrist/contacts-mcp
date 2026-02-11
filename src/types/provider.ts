import type { Contact } from './contact.js';

export interface ContactProvider {
  readonly name: string;
  readonly type: 'google' | 'apple' | 'carddav' | 'local';

  isConfigured(): Promise<boolean>;
  fetchAll(): Promise<Contact[]>;
  fetchOne(remoteId: string): Promise<Contact | null>;
  pushContact(contact: Contact): Promise<string>;
  updateContact(remoteId: string, contact: Contact): Promise<void>;
  deleteContact(remoteId: string): Promise<void>;
  getLastSyncTime(): Promise<string | null>;
  setLastSyncTime(time: string): Promise<void>;
}

export interface ProviderConfig {
  name: string;
  type: 'google' | 'apple' | 'carddav' | 'local';
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface SyncResult {
  provider: string;
  pulled: number;
  pushed: number;
  conflicts: number;
  errors: string[];
  duration: number;
}
