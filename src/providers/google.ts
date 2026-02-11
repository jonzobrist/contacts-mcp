import { google } from 'googleapis';
import type { Contact } from '../types/index.js';
import { BaseProvider } from './base.js';
import { createContact } from '../contacts/model.js';
import { generateId, logger } from '../utils/index.js';

/**
 * Google Contacts provider using the People API.
 *
 * Required config:
 * - clientId: OAuth2 client ID
 * - clientSecret: OAuth2 client secret
 * - refreshToken: OAuth2 refresh token
 */
export class GoogleProvider extends BaseProvider {
  readonly name: string;
  readonly type = 'google' as const;

  constructor(name: string, config: Record<string, unknown>) {
    super(config);
    this.name = name;
  }

  private getAuth() {
    const clientId = this.assertConfigured('clientId');
    const clientSecret = this.assertConfigured('clientSecret');
    const refreshToken = this.assertConfigured('refreshToken');

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    return auth;
  }

  async isConfigured(): Promise<boolean> {
    try {
      this.assertConfigured('clientId');
      this.assertConfigured('clientSecret');
      this.assertConfigured('refreshToken');
      return true;
    } catch {
      return false;
    }
  }

  async fetchAll(): Promise<Contact[]> {
    const auth = this.getAuth();
    const people = google.people({ version: 'v1', auth });

    const contacts: Contact[] = [];
    let nextPageToken: string | undefined;

    do {
      const res = await people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        personFields: 'names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,urls,biographies,photos,metadata',
        pageToken: nextPageToken,
      });

      for (const person of res.data.connections ?? []) {
        contacts.push(googlePersonToContact(person, this.name));
      }

      nextPageToken = res.data.nextPageToken ?? undefined;
    } while (nextPageToken);

    logger.info(`Google: fetched ${contacts.length} contacts`);
    return contacts;
  }

  async fetchOne(remoteId: string): Promise<Contact | null> {
    const auth = this.getAuth();
    const people = google.people({ version: 'v1', auth });

    try {
      const res = await people.people.get({
        resourceName: remoteId,
        personFields: 'names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,urls,biographies,photos,metadata',
      });
      return googlePersonToContact(res.data, this.name);
    } catch {
      return null;
    }
  }

  async pushContact(contact: Contact): Promise<string> {
    const auth = this.getAuth();
    const people = google.people({ version: 'v1', auth });

    const res = await people.people.createContact({
      requestBody: contactToGooglePerson(contact),
    });

    return res.data.resourceName ?? '';
  }

  async updateContact(remoteId: string, contact: Contact): Promise<void> {
    const auth = this.getAuth();
    const people = google.people({ version: 'v1', auth });

    // Fetch current etag first
    const current = await people.people.get({
      resourceName: remoteId,
      personFields: 'metadata',
    });

    const etag = current.data.etag;

    await people.people.updateContact({
      resourceName: remoteId,
      updatePersonFields: 'names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,urls,biographies',
      requestBody: {
        ...contactToGooglePerson(contact),
        etag: etag ?? undefined,
      },
    });
  }

  async deleteContact(remoteId: string): Promise<void> {
    const auth = this.getAuth();
    const people = google.people({ version: 'v1', auth });
    await people.people.deleteContact({ resourceName: remoteId });
  }
}

function googlePersonToContact(person: any, providerName: string): Contact {
  const primaryName = person.names?.[0];
  const fullName = primaryName?.displayName ?? 'Unknown';

  return createContact({
    id: generateId(),
    fullName,
    name: {
      givenName: primaryName?.givenName,
      familyName: primaryName?.familyName,
      middleName: primaryName?.middleName,
      prefix: primaryName?.honorificPrefix,
      suffix: primaryName?.honorificSuffix,
    },
    emails: (person.emailAddresses ?? []).map((e: any) => ({
      value: e.value ?? '',
      type: mapGoogleType(e.type),
      primary: e.metadata?.primary ?? false,
    })),
    phones: (person.phoneNumbers ?? []).map((p: any) => ({
      value: p.value ?? '',
      type: mapGoogleType(p.type),
      primary: p.metadata?.primary ?? false,
    })),
    addresses: (person.addresses ?? []).map((a: any) => ({
      street: a.streetAddress,
      city: a.city,
      state: a.region,
      postalCode: a.postalCode,
      country: a.country,
      type: mapGoogleType(a.type),
    })),
    organization: person.organizations?.[0] ? {
      name: person.organizations[0].name,
      title: person.organizations[0].title,
      department: person.organizations[0].department,
    } : undefined,
    birthday: person.birthdays?.[0]?.date
      ? `${person.birthdays[0].date.year ?? '0000'}-${String(person.birthdays[0].date.month ?? 1).padStart(2, '0')}-${String(person.birthdays[0].date.day ?? 1).padStart(2, '0')}`
      : undefined,
    urls: (person.urls ?? []).map((u: any) => ({
      value: u.value ?? '',
      type: mapGoogleType(u.type),
    })),
    notes: person.biographies?.[0]?.value,
    photo: person.photos?.[0]?.url,
    metadata: {
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      source: providerName,
      providerIds: { [providerName]: person.resourceName ?? '' },
      archived: false,
      etag: person.etag,
    },
  });
}

function contactToGooglePerson(contact: Contact): any {
  return {
    names: [{
      givenName: contact.name.givenName,
      familyName: contact.name.familyName,
      middleName: contact.name.middleName,
      honorificPrefix: contact.name.prefix,
      honorificSuffix: contact.name.suffix,
    }],
    emailAddresses: contact.emails.map(e => ({
      value: e.value,
      type: e.type ?? 'other',
    })),
    phoneNumbers: contact.phones.map(p => ({
      value: p.originalValue ?? p.value,
      type: p.type ?? 'other',
    })),
    addresses: contact.addresses.map(a => ({
      streetAddress: a.street,
      city: a.city,
      region: a.state,
      postalCode: a.postalCode,
      country: a.country,
      type: a.type ?? 'other',
    })),
    organizations: contact.organization ? [{
      name: contact.organization.name,
      title: contact.organization.title,
      department: contact.organization.department,
    }] : [],
    biographies: contact.notes ? [{ value: contact.notes }] : [],
  };
}

function mapGoogleType(type?: string): string | undefined {
  if (!type) return undefined;
  const lower = type.toLowerCase();
  if (lower === 'home' || lower === 'work' || lower === 'mobile' || lower === 'other') return lower;
  return 'other';
}
