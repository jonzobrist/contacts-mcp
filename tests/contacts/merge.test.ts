import { describe, it, expect } from 'vitest';
import { mergeContacts } from '../../src/contacts/merge.js';
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

describe('mergeContacts', () => {
  describe('union strategy', () => {
    it('should combine emails from both contacts without duplicates', () => {
      const a = contact({ fullName: 'Jane', emails: [{ value: 'jane@work.com' }] });
      const b = contact({ fullName: 'Jane', emails: [{ value: 'jane@home.com' }, { value: 'jane@work.com' }] });

      const result = mergeContacts([a, b], 'union');

      expect(result.mergedContact.emails).toHaveLength(2);
      const values = result.mergedContact.emails.map(e => e.value);
      expect(values).toContain('jane@work.com');
      expect(values).toContain('jane@home.com');
    });

    it('should combine phones from both contacts', () => {
      const a = contact({ fullName: 'Jane', phones: [{ value: '+1111' }] });
      const b = contact({ fullName: 'Jane', phones: [{ value: '+2222' }] });

      const result = mergeContacts([a, b], 'union');

      expect(result.mergedContact.phones).toHaveLength(2);
    });

    it('should combine categories without duplicates', () => {
      const a = contact({ fullName: 'Jane', categories: ['work', 'vip'] });
      const b = contact({ fullName: 'Jane', categories: ['vip', 'friend'] });

      const result = mergeContacts([a, b], 'union');

      expect(result.mergedContact.categories).toEqual(['work', 'vip', 'friend']);
    });

    it('should take the longer/more complete name', () => {
      const a = contact({ fullName: 'J. Smith' });
      const b = contact({ fullName: 'Jane Elizabeth Smith' });

      const result = mergeContacts([a, b], 'union');

      expect(result.mergedContact.fullName).toBe('Jane Elizabeth Smith');
    });

    it('should take organization from whichever has it', () => {
      const a = contact({ fullName: 'Jane' });
      const b = contact({ fullName: 'Jane', organization: { name: 'Acme', title: 'CTO' } });

      const result = mergeContacts([a, b], 'union');

      expect(result.mergedContact.organization?.name).toBe('Acme');
      expect(result.mergedContact.organization?.title).toBe('CTO');
    });

    it('should take birthday from whichever has it', () => {
      const a = contact({ fullName: 'Jane' });
      const b = contact({ fullName: 'Jane', birthday: '1990-05-15' });

      const result = mergeContacts([a, b], 'union');

      expect(result.mergedContact.birthday).toBe('1990-05-15');
    });

    it('should combine notes with separator', () => {
      const a = contact({ fullName: 'Jane', notes: 'From conference' });
      const b = contact({ fullName: 'Jane', notes: 'Prefers email' });

      const result = mergeContacts([a, b], 'union');

      expect(result.mergedContact.notes).toContain('From conference');
      expect(result.mergedContact.notes).toContain('Prefers email');
      expect(result.mergedContact.notes).toContain('---');
    });

    it('should not duplicate identical notes', () => {
      const a = contact({ fullName: 'Jane', notes: 'Same note' });
      const b = contact({ fullName: 'Jane', notes: 'Same note' });

      const result = mergeContacts([a, b], 'union');

      expect(result.mergedContact.notes).toBe('Same note');
    });
  });

  describe('keep-newest strategy', () => {
    it('should keep the most recently modified contact', () => {
      const a = contact({
        fullName: 'Old Jane',
        metadata: { created: '2020-01-01T00:00:00Z', modified: '2020-01-01T00:00:00Z', providerIds: {}, archived: false },
      });
      const b = contact({
        fullName: 'New Jane',
        metadata: { created: '2024-01-01T00:00:00Z', modified: '2024-06-01T00:00:00Z', providerIds: {}, archived: false },
      });

      const result = mergeContacts([a, b], 'keep-newest');

      expect(result.mergedContact.fullName).toBe('New Jane');
    });
  });

  describe('keep-oldest strategy', () => {
    it('should keep the earliest modified contact', () => {
      const a = contact({
        fullName: 'Old Jane',
        metadata: { created: '2020-01-01T00:00:00Z', modified: '2020-01-01T00:00:00Z', providerIds: {}, archived: false },
      });
      const b = contact({
        fullName: 'New Jane',
        metadata: { created: '2024-01-01T00:00:00Z', modified: '2024-06-01T00:00:00Z', providerIds: {}, archived: false },
      });

      const result = mergeContacts([a, b], 'keep-oldest');

      expect(result.mergedContact.fullName).toBe('Old Jane');
    });
  });

  it('should keep primary ID from first contact', () => {
    const a = contact({ id: 'primary-id', fullName: 'Jane' });
    const b = contact({ id: 'secondary-id', fullName: 'Jane' });

    const result = mergeContacts([a, b], 'union');

    expect(result.mergedContact.id).toBe('primary-id');
  });

  it('should merge providerIds from all contacts', () => {
    const a = contact({
      fullName: 'Jane',
      metadata: { created: '', modified: '', archived: false, providerIds: { google: 'g-123' } },
    });
    const b = contact({
      fullName: 'Jane',
      metadata: { created: '', modified: '', archived: false, providerIds: { fastmail: 'fm-456' } },
    });

    const result = mergeContacts([a, b], 'union');

    expect(result.mergedContact.metadata.providerIds).toEqual({
      google: 'g-123',
      fastmail: 'fm-456',
    });
  });

  it('should return source contact IDs', () => {
    const a = contact({ id: 'id-a', fullName: 'Jane' });
    const b = contact({ id: 'id-b', fullName: 'Jane' });
    const c = contact({ id: 'id-c', fullName: 'Jane' });

    const result = mergeContacts([a, b, c], 'union');

    expect(result.sourceContactIds).toEqual(['id-a', 'id-b', 'id-c']);
  });

  it('should merge 3+ contacts', () => {
    const a = contact({ fullName: 'Jane', emails: [{ value: 'a@test.com' }] });
    const b = contact({ fullName: 'Jane', emails: [{ value: 'b@test.com' }] });
    const c = contact({ fullName: 'Jane', emails: [{ value: 'c@test.com' }] });

    const result = mergeContacts([a, b, c], 'union');

    expect(result.mergedContact.emails).toHaveLength(3);
  });

  it('should apply field overrides', () => {
    const a = contact({ id: 'id-a', fullName: 'Jane A', organization: { name: 'Org A' } });
    const b = contact({ id: 'id-b', fullName: 'Jane B', organization: { name: 'Org B' } });

    const result = mergeContacts([a, b], 'union', { organization: 'id-b' });

    expect(result.mergedContact.organization?.name).toBe('Org B');
    expect(result.fieldsFromEach.organization).toBe('id-b');
  });

  it('should throw when given fewer than 2 contacts', () => {
    const a = contact({ fullName: 'Solo' });
    expect(() => mergeContacts([a], 'union')).toThrow('Need at least 2 contacts');
  });
});
