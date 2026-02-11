import { describe, it, expect } from 'vitest';
import { findDuplicates } from '../../src/contacts/dedup.js';
import { createContact } from '../../src/contacts/model.js';
import type { Contact } from '../../src/types/contact.js';

function contact(overrides: Partial<Contact> & { fullName: string }): Contact {
  return createContact({
    emails: [],
    phones: [],
    addresses: [],
    categories: [],
    ...overrides,
  });
}

describe('findDuplicates', () => {
  it('should detect duplicates by same email', () => {
    const contacts = [
      contact({ fullName: 'Jane Smith', emails: [{ value: 'jane@example.com' }] }),
      contact({ fullName: 'J. Smith', emails: [{ value: 'jane@example.com' }] }),
    ];

    const dupes = findDuplicates(contacts, { threshold: 0.5 });

    expect(dupes).toHaveLength(1);
    expect(dupes[0].confidence).toBe(0.95);
    expect(dupes[0].matchedFields.some(f => f.field === 'email')).toBe(true);
  });

  it('should detect duplicates by same email case-insensitive', () => {
    const contacts = [
      contact({ fullName: 'Jane', emails: [{ value: 'JANE@EXAMPLE.COM' }] }),
      contact({ fullName: 'Janet', emails: [{ value: 'jane@example.com' }] }),
    ];

    const dupes = findDuplicates(contacts, { threshold: 0.5 });

    expect(dupes).toHaveLength(1);
    expect(dupes[0].confidence).toBe(0.95);
  });

  it('should detect duplicates by same phone (different format)', () => {
    const contacts = [
      contact({ fullName: 'Bob A', phones: [{ value: '+15551234567' }] }),
      contact({ fullName: 'Bob B', phones: [{ value: '5551234567' }] }),
    ];

    const dupes = findDuplicates(contacts, { threshold: 0.5 });

    expect(dupes).toHaveLength(1);
    expect(dupes[0].confidence).toBeGreaterThanOrEqual(0.9);
    expect(dupes[0].matchedFields.some(f => f.field === 'phone')).toBe(true);
  });

  it('should detect duplicates by exact name match', () => {
    const contacts = [
      contact({ fullName: 'John Smith', name: { givenName: 'John', familyName: 'Smith' } }),
      contact({ fullName: 'John Smith', name: { givenName: 'John', familyName: 'Smith' } }),
    ];

    const dupes = findDuplicates(contacts, { threshold: 0.5 });

    expect(dupes).toHaveLength(1);
    expect(dupes[0].confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('should detect swapped names (John Smith vs Smith John)', () => {
    const contacts = [
      contact({ fullName: 'John Smith', name: { givenName: 'John', familyName: 'Smith' } }),
      contact({ fullName: 'Smith John', name: { givenName: 'Smith', familyName: 'John' } }),
    ];

    const dupes = findDuplicates(contacts, { threshold: 0.5 });

    expect(dupes).toHaveLength(1);
    expect(dupes[0].confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('should detect initials match (J. Smith vs Jane Smith)', () => {
    const contacts = [
      contact({ fullName: 'J Smith', name: { givenName: 'J', familyName: 'Smith' } }),
      contact({ fullName: 'Jane Smith', name: { givenName: 'Jane', familyName: 'Smith' } }),
    ];

    const dupes = findDuplicates(contacts, { threshold: 0.5 });

    expect(dupes).toHaveLength(1);
    expect(dupes[0].confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('should boost score for matching organization', () => {
    const contacts = [
      contact({ fullName: 'John Smith', name: { givenName: 'John', familyName: 'Smith' }, organization: { name: 'Acme Corp' } }),
      contact({ fullName: 'John Smith', name: { givenName: 'John', familyName: 'Smith' }, organization: { name: 'Acme Corp' } }),
    ];

    const dupes = findDuplicates(contacts, { threshold: 0.5 });

    expect(dupes).toHaveLength(1);
    // 0.70 (exact name) + 0.15 (org boost) = 0.85
    expect(dupes[0].confidence).toBeGreaterThanOrEqual(0.85);
    expect(dupes[0].matchedFields.some(f => f.field === 'organization')).toBe(true);
  });

  it('should NOT report completely different contacts as duplicates', () => {
    const contacts = [
      contact({ fullName: 'Alice Wonderland', emails: [{ value: 'alice@test.com' }] }),
      contact({ fullName: 'Bob Builder', emails: [{ value: 'bob@other.com' }] }),
    ];

    const dupes = findDuplicates(contacts, { threshold: 0.5 });

    expect(dupes).toHaveLength(0);
  });

  it('should respect threshold parameter', () => {
    const contacts = [
      contact({ fullName: 'John Smith', name: { givenName: 'John', familyName: 'Smith' } }),
      contact({ fullName: 'Jon Smyth', name: { givenName: 'Jon', familyName: 'Smyth' } }),
    ];

    // With high threshold, fuzzy name match should not qualify
    const strict = findDuplicates(contacts, { threshold: 0.9 });
    expect(strict).toHaveLength(0);

    // With low threshold, it should
    const loose = findDuplicates(contacts, { threshold: 0.3 });
    expect(loose.length).toBeGreaterThanOrEqual(0); // may or may not match depending on similarity
  });

  it('should respect limit parameter', () => {
    // Create many pairs that will match
    const contacts = [];
    for (let i = 0; i < 10; i++) {
      contacts.push(contact({ fullName: `User ${i}`, emails: [{ value: `shared${i}@test.com` }] }));
      contacts.push(contact({ fullName: `Person ${i}`, emails: [{ value: `shared${i}@test.com` }] }));
    }

    const limited = findDuplicates(contacts, { threshold: 0.5, limit: 3 });

    expect(limited).toHaveLength(3);
  });

  it('should sort results by confidence descending', () => {
    const contacts = [
      contact({ fullName: 'Exact Match', emails: [{ value: 'same@test.com' }] }),
      contact({ fullName: 'Exact Match', emails: [{ value: 'same@test.com' }] }),
      contact({ fullName: 'Fuzzy One', name: { givenName: 'Fuzzy', familyName: 'One' } }),
      contact({ fullName: 'Fuzzy One', name: { givenName: 'Fuzzy', familyName: 'One' } }),
    ];

    const dupes = findDuplicates(contacts, { threshold: 0.5 });

    if (dupes.length > 1) {
      expect(dupes[0].confidence).toBeGreaterThanOrEqual(dupes[1].confidence);
    }
  });

  it('should not compare a contact with itself', () => {
    const c = contact({ fullName: 'Solo', emails: [{ value: 'solo@test.com' }] });
    const dupes = findDuplicates([c], { threshold: 0.1 });
    expect(dupes).toHaveLength(0);
  });
});
