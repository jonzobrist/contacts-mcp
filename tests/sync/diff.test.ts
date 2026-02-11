import { describe, it, expect } from 'vitest';
import { diffContacts, hasChanges } from '../../src/sync/diff.js';
import { createContact } from '../../src/contacts/model.js';

describe('diffContacts', () => {
  it('should return empty array for identical contacts', () => {
    const a = createContact({ fullName: 'Jane', emails: [{ value: 'jane@test.com' }] });
    const b = { ...a };

    const diffs = diffContacts(a, b);
    expect(diffs).toHaveLength(0);
  });

  it('should detect changed fullName', () => {
    const a = createContact({ fullName: 'Jane Smith' });
    const b = createContact({ fullName: 'Jane Doe' });

    const diffs = diffContacts(a, b);
    expect(diffs.some(d => d.field === 'fullName')).toBe(true);
  });

  it('should detect changed emails', () => {
    const a = createContact({ fullName: 'Jane', emails: [{ value: 'old@test.com' }] });
    const b = createContact({ fullName: 'Jane', emails: [{ value: 'new@test.com' }] });

    const diffs = diffContacts(a, b);
    expect(diffs.some(d => d.field === 'emails')).toBe(true);
  });

  it('should detect changed organization', () => {
    const a = createContact({ fullName: 'Jane', organization: { name: 'Acme' } });
    const b = createContact({ fullName: 'Jane', organization: { name: 'TechCo' } });

    const diffs = diffContacts(a, b);
    expect(diffs.some(d => d.field === 'organization')).toBe(true);
  });

  it('should detect changed notes', () => {
    const a = createContact({ fullName: 'Jane', notes: 'old' });
    const b = createContact({ fullName: 'Jane', notes: 'new' });

    const diffs = diffContacts(a, b);
    expect(diffs.some(d => d.field === 'notes')).toBe(true);
  });

  it('should detect changed birthday', () => {
    const a = createContact({ fullName: 'Jane', birthday: '1990-01-01' });
    const b = createContact({ fullName: 'Jane', birthday: '1991-02-02' });

    const diffs = diffContacts(a, b);
    expect(diffs.some(d => d.field === 'birthday')).toBe(true);
  });
});

describe('hasChanges', () => {
  it('should return false for identical contacts', () => {
    const a = createContact({ fullName: 'Jane' });
    expect(hasChanges(a, { ...a })).toBe(false);
  });

  it('should return true when contacts differ', () => {
    const a = createContact({ fullName: 'Jane' });
    const b = createContact({ fullName: 'Janet' });
    expect(hasChanges(a, b)).toBe(true);
  });
});
