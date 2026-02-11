import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Contact, ContactSummary } from '../types/index.js';
import { toSummary } from '../types/index.js';

const FUSE_OPTIONS: IFuseOptions<Contact> = {
  keys: [
    { name: 'fullName', weight: 0.35 },
    { name: 'emails.value', weight: 0.25 },
    { name: 'phones.value', weight: 0.15 },
    { name: 'phones.originalValue', weight: 0.05 },
    { name: 'organization.name', weight: 0.1 },
    { name: 'notes', weight: 0.05 },
    { name: 'categories', weight: 0.05 },
  ],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

export function searchContacts(
  contacts: Contact[],
  query: string,
  limit: number = 20,
): ContactSummary[] {
  if (!query.trim()) {
    return contacts.slice(0, limit).map(toSummary);
  }

  const fuse = new Fuse(contacts, FUSE_OPTIONS);
  const results = fuse.search(query, { limit });

  return results.map(r => toSummary(r.item));
}
