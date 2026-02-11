export interface ContactEmail {
  value: string;
  type?: 'home' | 'work' | 'other';
  primary?: boolean;
}

export interface ContactPhone {
  value: string;
  originalValue?: string;
  type?: 'home' | 'work' | 'mobile' | 'fax' | 'other';
  primary?: boolean;
}

export interface ContactAddress {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  type?: 'home' | 'work' | 'other';
}

export interface ContactOrganization {
  name?: string;
  department?: string;
  title?: string;
}

export interface ContactName {
  prefix?: string;
  givenName?: string;
  middleName?: string;
  familyName?: string;
  suffix?: string;
}

export interface ContactUrl {
  value: string;
  type?: 'home' | 'work' | 'blog' | 'profile' | 'other';
}

export interface ContactMetadata {
  created: string;
  modified: string;
  source?: string;
  providerIds: Record<string, string>;
  archived: boolean;
  etag?: string;
}

export interface Contact {
  id: string;
  fullName: string;
  name: ContactName;
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  organization?: ContactOrganization;
  birthday?: string;
  anniversary?: string;
  urls: ContactUrl[];
  notes?: string;
  categories: string[];
  photo?: string;
  metadata: ContactMetadata;
}

export interface ContactSummary {
  id: string;
  fullName: string;
  primaryEmail?: string;
  primaryPhone?: string;
  organization?: string;
  archived: boolean;
}

export function toSummary(contact: Contact): ContactSummary {
  return {
    id: contact.id,
    fullName: contact.fullName,
    primaryEmail: contact.emails.find(e => e.primary)?.value ?? contact.emails[0]?.value,
    primaryPhone: contact.phones.find(p => p.primary)?.value ?? contact.phones[0]?.value,
    organization: contact.organization?.name,
    archived: contact.metadata.archived,
  };
}
