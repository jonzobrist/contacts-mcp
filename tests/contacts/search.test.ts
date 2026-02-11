import { describe, it, expect } from 'vitest';
import { searchContacts } from '../../src/contacts/search.js';
import { createContact } from '../../src/contacts/model.js';

const contacts = [
  createContact({ fullName: 'John Smith', emails: [{ value: 'john@example.com' }], organization: { name: 'Acme Corp' } }),
  createContact({ fullName: 'Jane Doe', emails: [{ value: 'jane@test.org' }], phones: [{ value: '+15551234567' }] }),
  createContact({ fullName: 'Bob Johnson', notes: 'met at conference', categories: ['work'] }),
  createContact({ fullName: 'Alice Wonderland', organization: { name: 'TechCo' } }),
];

describe('searchContacts', () => {
  it('should find contacts by name', () => {
    const results = searchContacts(contacts, 'John');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].fullName).toBe('John Smith');
  });

  it('should find contacts by partial name', () => {
    const results = searchContacts(contacts, 'Smi');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.fullName === 'John Smith')).toBe(true);
  });

  it('should find contacts by email', () => {
    const results = searchContacts(contacts, 'jane@test');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].fullName).toBe('Jane Doe');
  });

  it('should find contacts by organization', () => {
    const results = searchContacts(contacts, 'Acme');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].fullName).toBe('John Smith');
  });

  it('should return empty query as first N contacts', () => {
    const results = searchContacts(contacts, '');
    expect(results).toHaveLength(4);
  });

  it('should respect limit parameter', () => {
    const results = searchContacts(contacts, '', 2);
    expect(results).toHaveLength(2);
  });

  it('should return empty for no match', () => {
    const results = searchContacts(contacts, 'zzzznonexistent');
    expect(results).toHaveLength(0);
  });

  it('should return ContactSummary objects', () => {
    const results = searchContacts(contacts, 'John');
    expect(results[0]).toHaveProperty('id');
    expect(results[0]).toHaveProperty('fullName');
    expect(results[0]).toHaveProperty('archived');
    // Should NOT have full contact fields
    expect(results[0]).not.toHaveProperty('metadata');
    expect(results[0]).not.toHaveProperty('addresses');
  });
});
