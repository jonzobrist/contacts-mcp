import type { Contact, ContactName } from '../types/index.js';
import { generateId } from '../utils/index.js';

export function createContact(fields: Partial<Contact> & { fullName: string }): Contact {
  const now = new Date().toISOString();
  return {
    id: fields.id ?? generateId(),
    fullName: fields.fullName,
    name: hasNameFields(fields.name) ? fields.name : parseName(fields.fullName),
    emails: fields.emails ?? [],
    phones: fields.phones ?? [],
    addresses: fields.addresses ?? [],
    organization: fields.organization,
    birthday: fields.birthday,
    anniversary: fields.anniversary,
    urls: fields.urls ?? [],
    notes: fields.notes,
    categories: fields.categories ?? [],
    photo: fields.photo,
    metadata: fields.metadata ?? {
      created: now,
      modified: now,
      providerIds: {},
      archived: false,
    },
  };
}

function hasNameFields(name?: ContactName): name is ContactName {
  if (!name) return false;
  return !!(name.givenName || name.familyName || name.middleName || name.prefix || name.suffix);
}

/** Best-effort name parsing from a full name string. */
export function parseName(fullName: string): ContactName {
  const trimmed = fullName.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { givenName: parts[0] };
  if (parts.length === 2) return { givenName: parts[0], familyName: parts[1] };
  return {
    givenName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    familyName: parts[parts.length - 1],
  };
}
