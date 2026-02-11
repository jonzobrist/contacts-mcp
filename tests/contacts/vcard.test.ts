import { describe, it, expect } from 'vitest';
import { contactToVCard, vcardToContact } from '../../src/contacts/vcard.js';
import { createContact } from '../../src/contacts/model.js';

describe('vCard serialization', () => {
  it('should round-trip a full contact', () => {
    const contact = createContact({
      id: '550e8400-e29b-41d4-a716-446655440000',
      fullName: 'Jane Doe',
      name: { givenName: 'Jane', familyName: 'Doe' },
      emails: [
        { value: 'jane@example.com', type: 'work', primary: true },
        { value: 'jdoe@home.net', type: 'home' },
      ],
      phones: [
        { value: '+15551234567', type: 'mobile', primary: true },
        { value: '+15559876543', type: 'work' },
      ],
      addresses: [{
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
        country: 'US',
        type: 'home',
      }],
      organization: { name: 'Acme Corp', title: 'Engineer', department: 'R&D' },
      birthday: '1990-05-15',
      notes: 'Met at conference',
      categories: ['work', 'vip'],
    });

    const vcard = contactToVCard(contact);
    const parsed = vcardToContact(vcard);

    expect(parsed.id).toBe(contact.id);
    expect(parsed.fullName).toBe('Jane Doe');
    expect(parsed.name.givenName).toBe('Jane');
    expect(parsed.name.familyName).toBe('Doe');
    expect(parsed.emails).toHaveLength(2);
    expect(parsed.emails[0].value).toBe('jane@example.com');
    expect(parsed.emails[0].type).toBe('work');
    expect(parsed.emails[0].primary).toBe(true);
    expect(parsed.emails[1].value).toBe('jdoe@home.net');
    expect(parsed.phones).toHaveLength(2);
    expect(parsed.phones[0].value).toBe('+15551234567');
    expect(parsed.phones[0].type).toBe('mobile');
    expect(parsed.addresses).toHaveLength(1);
    expect(parsed.addresses[0].street).toBe('123 Main St');
    expect(parsed.addresses[0].city).toBe('Springfield');
    expect(parsed.addresses[0].state).toBe('IL');
    expect(parsed.addresses[0].postalCode).toBe('62701');
    expect(parsed.addresses[0].country).toBe('US');
    expect(parsed.organization?.name).toBe('Acme Corp');
    expect(parsed.organization?.title).toBe('Engineer');
    expect(parsed.organization?.department).toBe('R&D');
    expect(parsed.birthday).toBe('1990-05-15');
    expect(parsed.notes).toBe('Met at conference');
    expect(parsed.categories).toEqual(['work', 'vip']);
  });

  it('should round-trip a minimal contact', () => {
    const contact = createContact({ fullName: 'Bob' });
    const vcard = contactToVCard(contact);
    const parsed = vcardToContact(vcard);

    expect(parsed.fullName).toBe('Bob');
    expect(parsed.emails).toHaveLength(0);
    expect(parsed.phones).toHaveLength(0);
  });

  it('should handle Unicode names', () => {
    const contact = createContact({
      fullName: 'Müller Straße',
      name: { givenName: 'Müller', familyName: 'Straße' },
    });
    const vcard = contactToVCard(contact);
    const parsed = vcardToContact(vcard);

    expect(parsed.fullName).toBe('Müller Straße');
    expect(parsed.name.givenName).toBe('Müller');
    expect(parsed.name.familyName).toBe('Straße');
  });

  it('should handle CJK characters', () => {
    const contact = createContact({
      fullName: '田中太郎',
      name: { familyName: '田中', givenName: '太郎' },
    });
    const vcard = contactToVCard(contact);
    const parsed = vcardToContact(vcard);

    expect(parsed.fullName).toBe('田中太郎');
    expect(parsed.name.familyName).toBe('田中');
  });

  it('should handle notes with newlines', () => {
    const contact = createContact({
      fullName: 'Test',
      notes: 'Line one\nLine two\nLine three',
    });
    const vcard = contactToVCard(contact);
    const parsed = vcardToContact(vcard);

    expect(parsed.notes).toBe('Line one\nLine two\nLine three');
  });

  it('should handle special characters in values (commas, semicolons)', () => {
    const contact = createContact({
      fullName: 'Test User',
      organization: { name: 'Smith, Jones & Associates', title: 'VP; Sales' },
    });
    const vcard = contactToVCard(contact);
    const parsed = vcardToContact(vcard);

    expect(parsed.organization?.name).toBe('Smith, Jones & Associates');
    expect(parsed.organization?.title).toBe('VP; Sales');
  });

  it('should preserve UID as urn:uuid format', () => {
    const contact = createContact({
      id: 'abcd1234-ef56-7890-abcd-ef1234567890',
      fullName: 'Test',
    });
    const vcard = contactToVCard(contact);

    expect(vcard).toContain('UID:urn:uuid:abcd1234-ef56-7890-abcd-ef1234567890');
  });

  it('should serialize and parse metadata X-properties', () => {
    const contact = createContact({
      fullName: 'Test',
      metadata: {
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-06-15T12:00:00.000Z',
        source: 'google-personal',
        providerIds: { 'google-personal': 'people/123', 'fastmail': '/card/abc' },
        archived: false,
      },
    });
    const vcard = contactToVCard(contact);
    const parsed = vcardToContact(vcard);

    expect(parsed.metadata.created).toBe('2025-01-01T00:00:00.000Z');
    expect(parsed.metadata.source).toBe('google-personal');
    expect(parsed.metadata.providerIds).toEqual({
      'google-personal': 'people/123',
      'fastmail': '/card/abc',
    });
  });

  it('should parse a standard vCard from an external source', () => {
    const externalVCard = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      'FN:John Smith',
      'N:Smith;John;;;',
      'EMAIL;TYPE=work:john@company.com',
      'TEL;TYPE=cell:+1-555-000-1111',
      'ORG:Big Company Inc.',
      'TITLE:Manager',
      'BDAY:1985-03-20',
      'END:VCARD',
    ].join('\r\n');

    const parsed = vcardToContact(externalVCard);

    expect(parsed.fullName).toBe('John Smith');
    expect(parsed.name.familyName).toBe('Smith');
    expect(parsed.name.givenName).toBe('John');
    expect(parsed.emails[0].value).toBe('john@company.com');
    expect(parsed.phones[0].value).toBe('+1-555-000-1111');
    expect(parsed.organization?.name).toBe('Big Company Inc.');
    expect(parsed.organization?.title).toBe('Manager');
    expect(parsed.birthday).toBe('1985-03-20');
  });

  it('should handle multiple addresses', () => {
    const contact = createContact({
      fullName: 'Multi Addr',
      addresses: [
        { street: '100 Work Blvd', city: 'NYC', state: 'NY', type: 'work' },
        { street: '200 Home Ln', city: 'LA', state: 'CA', type: 'home' },
      ],
    });
    const vcard = contactToVCard(contact);
    const parsed = vcardToContact(vcard);

    expect(parsed.addresses).toHaveLength(2);
    expect(parsed.addresses[0].city).toBe('NYC');
    expect(parsed.addresses[0].type).toBe('work');
    expect(parsed.addresses[1].city).toBe('LA');
    expect(parsed.addresses[1].type).toBe('home');
  });
});
