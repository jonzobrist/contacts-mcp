import { describe, it, expect } from 'vitest';
import { createContact, parseName } from '../../src/contacts/model.js';

describe('parseName', () => {
  it('should parse "John Doe" into given and family name', () => {
    expect(parseName('John Doe')).toEqual({
      givenName: 'John',
      familyName: 'Doe',
    });
  });

  it('should parse three-part name with middle name', () => {
    expect(parseName('John Michael Doe')).toEqual({
      givenName: 'John',
      middleName: 'Michael',
      familyName: 'Doe',
    });
  });

  it('should parse multi-word middle name', () => {
    expect(parseName('Mary Jane Watson Parker')).toEqual({
      givenName: 'Mary',
      middleName: 'Jane Watson',
      familyName: 'Parker',
    });
  });

  it('should parse single name as given name only', () => {
    expect(parseName('Madonna')).toEqual({
      givenName: 'Madonna',
    });
  });

  it('should handle empty string', () => {
    expect(parseName('')).toEqual({});
  });

  it('should trim whitespace', () => {
    expect(parseName('  John   Doe  ')).toEqual({
      givenName: 'John',
      familyName: 'Doe',
    });
  });
});

describe('createContact', () => {
  it('should create a contact with defaults', () => {
    const contact = createContact({ fullName: 'Test User' });

    expect(contact.fullName).toBe('Test User');
    expect(contact.id).toBeTruthy();
    expect(contact.emails).toEqual([]);
    expect(contact.phones).toEqual([]);
    expect(contact.categories).toEqual([]);
    expect(contact.metadata.archived).toBe(false);
    expect(contact.metadata.providerIds).toEqual({});
    expect(contact.metadata.created).toBeTruthy();
    expect(contact.metadata.modified).toBeTruthy();
  });

  it('should use parseName when name fields are empty', () => {
    const contact = createContact({ fullName: 'Jane Smith' });

    expect(contact.name.givenName).toBe('Jane');
    expect(contact.name.familyName).toBe('Smith');
  });

  it('should use provided name when givenName is set', () => {
    const contact = createContact({
      fullName: 'Jane Smith',
      name: { givenName: 'Janet', familyName: 'Smithson' },
    });

    expect(contact.name.givenName).toBe('Janet');
    expect(contact.name.familyName).toBe('Smithson');
  });

  it('should fall back to parseName when name object has no real fields', () => {
    const contact = createContact({
      fullName: 'Jane Smith',
      name: {},
    });

    // hasNameFields returns false for empty object, so parseName kicks in
    expect(contact.name.givenName).toBe('Jane');
    expect(contact.name.familyName).toBe('Smith');
  });

  it('should use provided id', () => {
    const contact = createContact({
      id: 'custom-id-123',
      fullName: 'Test',
    });
    expect(contact.id).toBe('custom-id-123');
  });

  it('should use provided metadata', () => {
    const contact = createContact({
      fullName: 'Test',
      metadata: {
        created: '2020-01-01T00:00:00Z',
        modified: '2020-06-01T00:00:00Z',
        providerIds: { google: 'people/123' },
        archived: true,
      },
    });
    expect(contact.metadata.created).toBe('2020-01-01T00:00:00Z');
    expect(contact.metadata.archived).toBe(true);
    expect(contact.metadata.providerIds.google).toBe('people/123');
  });
});
