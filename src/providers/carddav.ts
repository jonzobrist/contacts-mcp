import { createDAVClient } from 'tsdav';
import type { Contact } from '../types/index.js';
import { BaseProvider } from './base.js';
import { vcardToContact, contactToVCard } from '../contacts/vcard.js';
import { generateId, logger, ProviderError } from '../utils/index.js';

/**
 * CardDAV provider for Fastmail, Nextcloud, iCloud, Radicale, etc.
 *
 * Required config:
 * - serverUrl: CardDAV server URL
 * - username: Username
 * - password: Password or app-specific password
 * - authMethod: 'Basic' or 'Digest' (default: 'Basic')
 */
export class CardDAVProvider extends BaseProvider {
  readonly name: string;
  readonly type = 'carddav' as const;
  private client: Awaited<ReturnType<typeof createDAVClient>> | null = null;

  constructor(name: string, config: Record<string, unknown>) {
    super(config);
    this.name = name;
  }

  async isConfigured(): Promise<boolean> {
    try {
      this.assertConfigured('serverUrl');
      this.assertConfigured('username');
      this.assertConfigured('password');
      return true;
    } catch {
      return false;
    }
  }

  private async getClient() {
    if (this.client) return this.client;

    const serverUrl = this.assertConfigured('serverUrl');
    const username = this.assertConfigured('username');
    const password = this.assertConfigured('password');
    const authMethod = (this.config.authMethod as string) ?? 'Basic';

    this.client = await createDAVClient({
      serverUrl,
      credentials: { username, password },
      authMethod: authMethod as any,
      defaultAccountType: 'carddav',
    });

    return this.client;
  }

  async fetchAll(): Promise<Contact[]> {
    const client = await this.getClient();

    const addressBooks = await client.fetchAddressBooks();
    if (addressBooks.length === 0) {
      throw new ProviderError(this.name, 'No address books found');
    }

    const contacts: Contact[] = [];

    for (const book of addressBooks) {
      const vcards = await client.fetchVCards({ addressBook: book });
      for (const vcard of vcards) {
        if (!vcard.data) continue;
        try {
          const contact = vcardToContact(vcard.data);
          contact.metadata.source = this.name;
          contact.metadata.providerIds[this.name] = vcard.url;
          contact.metadata.etag = vcard.etag ?? undefined;
          contacts.push(contact);
        } catch (err) {
          logger.warn(`CardDAV: failed to parse vCard from ${vcard.url}:`, err);
        }
      }
    }

    logger.info(`CardDAV: fetched ${contacts.length} contacts from ${addressBooks.length} address book(s)`);
    return contacts;
  }

  async fetchOne(remoteUrl: string): Promise<Contact | null> {
    const client = await this.getClient();

    try {
      const result = await client.fetchVCards({
        addressBook: { url: remoteUrl },
        objectUrls: [remoteUrl],
      } as any);

      if (result.length === 0 || !result[0].data) return null;
      const contact = vcardToContact(result[0].data);
      contact.metadata.providerIds[this.name] = remoteUrl;
      contact.metadata.etag = result[0].etag ?? undefined;
      return contact;
    } catch {
      return null;
    }
  }

  async pushContact(contact: Contact): Promise<string> {
    const client = await this.getClient();
    const addressBooks = await client.fetchAddressBooks();
    if (addressBooks.length === 0) {
      throw new ProviderError(this.name, 'No address books found');
    }

    const vcard = contactToVCard(contact);
    const url = `${addressBooks[0].url}${contact.id}.vcf`;

    await client.createVCard({
      addressBook: addressBooks[0],
      filename: `${contact.id}.vcf`,
      vCardString: vcard,
    });

    return url;
  }

  async updateContact(remoteUrl: string, contact: Contact): Promise<void> {
    const client = await this.getClient();
    const vcard = contactToVCard(contact);

    await client.updateVCard({
      vCard: {
        url: remoteUrl,
        data: vcard,
        etag: contact.metadata.etag,
      },
    });
  }

  async deleteContact(remoteUrl: string): Promise<void> {
    const client = await this.getClient();

    await client.deleteVCard({
      vCard: { url: remoteUrl },
    });
  }
}
