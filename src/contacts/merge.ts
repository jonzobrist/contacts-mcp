import type { Contact, MergeStrategy, MergeResult } from '../types/index.js';

/**
 * Merge multiple contacts into one using the specified strategy.
 * The first contact is the "primary" - its ID is kept.
 */
export function mergeContacts(
  contacts: Contact[],
  strategy: MergeStrategy = 'union',
  fieldOverrides?: Record<string, string>,
): MergeResult {
  if (contacts.length < 2) {
    throw new Error('Need at least 2 contacts to merge');
  }

  const primary = contacts[0];
  const fieldsFromEach: Record<string, string> = {};

  let merged: Contact;

  switch (strategy) {
    case 'keep-newest':
      merged = mergeKeepNewest(contacts);
      break;
    case 'keep-oldest':
      merged = mergeKeepOldest(contacts);
      break;
    case 'union':
    default:
      merged = mergeUnion(contacts);
      break;
  }

  // Apply manual overrides
  if (fieldOverrides) {
    for (const [field, contactId] of Object.entries(fieldOverrides)) {
      const source = contacts.find(c => c.id === contactId);
      if (!source) continue;
      applyFieldOverride(merged, source, field);
      fieldsFromEach[field] = contactId;
    }
  }

  // Always keep primary's ID
  merged.id = primary.id;
  merged.metadata.modified = new Date().toISOString();
  merged.metadata.archived = false;

  // Merge provider IDs from all contacts
  for (const contact of contacts) {
    for (const [provider, remoteId] of Object.entries(contact.metadata.providerIds)) {
      if (!merged.metadata.providerIds[provider]) {
        merged.metadata.providerIds[provider] = remoteId;
      }
    }
  }

  return {
    mergedContact: merged,
    sourceContactIds: contacts.map(c => c.id),
    fieldsFromEach,
  };
}

function mergeKeepNewest(contacts: Contact[]): Contact {
  const sorted = [...contacts].sort(
    (a, b) => new Date(b.metadata.modified).getTime() - new Date(a.metadata.modified).getTime()
  );
  return structuredClone(sorted[0]);
}

function mergeKeepOldest(contacts: Contact[]): Contact {
  const sorted = [...contacts].sort(
    (a, b) => new Date(a.metadata.modified).getTime() - new Date(b.metadata.modified).getTime()
  );
  return structuredClone(sorted[0]);
}

function mergeUnion(contacts: Contact[]): Contact {
  const primary = structuredClone(contacts[0]);

  for (let i = 1; i < contacts.length; i++) {
    const other = contacts[i];

    // Use longest/most complete name
    if (other.fullName.length > primary.fullName.length) {
      primary.fullName = other.fullName;
      primary.name = { ...other.name };
    }

    // Union emails (deduplicate by lowercase value)
    const emailSet = new Set(primary.emails.map(e => e.value.toLowerCase()));
    for (const email of other.emails) {
      if (!emailSet.has(email.value.toLowerCase())) {
        primary.emails.push(email);
        emailSet.add(email.value.toLowerCase());
      }
    }

    // Union phones (deduplicate by normalized value)
    const phoneSet = new Set(primary.phones.map(p => p.value));
    for (const phone of other.phones) {
      if (!phoneSet.has(phone.value)) {
        primary.phones.push(phone);
        phoneSet.add(phone.value);
      }
    }

    // Union addresses (simple string comparison)
    const addrSet = new Set(primary.addresses.map(a => JSON.stringify(a)));
    for (const addr of other.addresses) {
      const key = JSON.stringify(addr);
      if (!addrSet.has(key)) {
        primary.addresses.push(addr);
        addrSet.add(key);
      }
    }

    // Take organization if primary doesn't have one
    if (!primary.organization?.name && other.organization?.name) {
      primary.organization = { ...other.organization };
    }

    // Take birthday if primary doesn't have one
    if (!primary.birthday && other.birthday) {
      primary.birthday = other.birthday;
    }

    // Union URLs
    const urlSet = new Set(primary.urls.map(u => u.value));
    for (const url of other.urls) {
      if (!urlSet.has(url.value)) {
        primary.urls.push(url);
        urlSet.add(url.value);
      }
    }

    // Combine notes
    if (other.notes && other.notes !== primary.notes) {
      primary.notes = [primary.notes, other.notes].filter(Boolean).join('\n---\n');
    }

    // Union categories
    const catSet = new Set(primary.categories);
    for (const cat of other.categories) {
      if (!catSet.has(cat)) {
        primary.categories.push(cat);
        catSet.add(cat);
      }
    }

    // Take photo if primary doesn't have one
    if (!primary.photo && other.photo) {
      primary.photo = other.photo;
    }

    // Keep earliest created date
    if (new Date(other.metadata.created) < new Date(primary.metadata.created)) {
      primary.metadata.created = other.metadata.created;
    }
  }

  return primary;
}

function applyFieldOverride(target: Contact, source: Contact, field: string): void {
  switch (field) {
    case 'fullName': target.fullName = source.fullName; target.name = { ...source.name }; break;
    case 'emails': target.emails = [...source.emails]; break;
    case 'phones': target.phones = [...source.phones]; break;
    case 'addresses': target.addresses = [...source.addresses]; break;
    case 'organization': target.organization = source.organization ? { ...source.organization } : undefined; break;
    case 'birthday': target.birthday = source.birthday; break;
    case 'notes': target.notes = source.notes; break;
    case 'categories': target.categories = [...source.categories]; break;
    case 'photo': target.photo = source.photo; break;
  }
}
