import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeEmail, normalizeContact } from '../../src/contacts/normalize.js';
import { createContact } from '../../src/contacts/model.js';

describe('normalizePhone', () => {
  it('should normalize US phone with parens and dashes', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
  });

  it('should normalize US phone with dashes only', () => {
    expect(normalizePhone('555-123-4567')).toBe('+15551234567');
  });

  it('should normalize phone with spaces', () => {
    expect(normalizePhone('555 123 4567')).toBe('+15551234567');
  });

  it('should normalize phone with dots', () => {
    expect(normalizePhone('555.123.4567')).toBe('+15551234567');
  });

  it('should keep already-E.164 phones unchanged', () => {
    expect(normalizePhone('+15551234567')).toBe('+15551234567');
  });

  it('should normalize UK phone number', () => {
    const result = normalizePhone('+44 20 7946 0958');
    expect(result).toBe('+442079460958');
  });

  it('should return stripped version for unparseable numbers', () => {
    const result = normalizePhone('ext 123');
    // Should strip spaces/punctuation but not crash
    expect(result).toBe('ext123');
  });

  it('should handle empty string', () => {
    expect(normalizePhone('')).toBe('');
  });
});

describe('normalizeEmail', () => {
  it('should lowercase emails', () => {
    expect(normalizeEmail('John@Example.COM')).toBe('john@example.com');
  });

  it('should trim whitespace', () => {
    expect(normalizeEmail('  jane@test.com  ')).toBe('jane@test.com');
  });

  it('should handle already normalized emails', () => {
    expect(normalizeEmail('bob@example.org')).toBe('bob@example.org');
  });
});

describe('normalizeContact', () => {
  it('should normalize all emails and phones on a contact', () => {
    const contact = createContact({
      fullName: '  Jane Smith  ',
      emails: [
        { value: 'JANE@Example.COM', type: 'work' },
      ],
      phones: [
        { value: '(415) 555-1234', type: 'mobile' },
      ],
    });

    const normalized = normalizeContact(contact);

    expect(normalized.fullName).toBe('Jane Smith');
    expect(normalized.emails[0].value).toBe('jane@example.com');
    expect(normalized.phones[0].value).toBe('+14155551234');
    expect(normalized.phones[0].originalValue).toBe('(415) 555-1234');
  });

  it('should trim name fields', () => {
    const contact = createContact({
      fullName: 'Jane Smith',
      name: { givenName: '  Jane  ', familyName: '  Smith  ' },
    });

    const normalized = normalizeContact(contact);

    expect(normalized.name.givenName).toBe('Jane');
    expect(normalized.name.familyName).toBe('Smith');
  });

  it('should not set originalValue when phone does not change', () => {
    const contact = createContact({
      fullName: 'Test',
      phones: [{ value: '+15551234567' }],
    });

    const normalized = normalizeContact(contact);
    expect(normalized.phones[0].originalValue).toBeUndefined();
  });
});
