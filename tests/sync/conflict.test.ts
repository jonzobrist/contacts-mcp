import { describe, it, expect } from 'vitest';
import { resolveConflict } from '../../src/sync/conflict.js';
import { createContact } from '../../src/contacts/model.js';

const local = createContact({
  fullName: 'Local Jane',
  metadata: { created: '2024-01-01T00:00:00Z', modified: '2024-06-01T00:00:00Z', providerIds: {}, archived: false },
});

const remote = createContact({
  fullName: 'Remote Jane',
  metadata: { created: '2024-01-01T00:00:00Z', modified: '2024-07-01T00:00:00Z', providerIds: {}, archived: false },
});

describe('resolveConflict', () => {
  it('should keep local with local-wins strategy', () => {
    const result = resolveConflict(local, remote, 'local-wins');
    expect(result.resolved).toBe(true);
    expect(result.winner).toBe('local');
    expect(result.contact.fullName).toBe('Local Jane');
  });

  it('should keep remote with remote-wins strategy', () => {
    const result = resolveConflict(local, remote, 'remote-wins');
    expect(result.resolved).toBe(true);
    expect(result.winner).toBe('remote');
    expect(result.contact.fullName).toBe('Remote Jane');
  });

  it('should keep newer with newest-wins strategy', () => {
    // remote has later modified date
    const result = resolveConflict(local, remote, 'newest-wins');
    expect(result.resolved).toBe(true);
    expect(result.winner).toBe('remote');
    expect(result.contact.fullName).toBe('Remote Jane');
  });

  it('should keep local when local is newer with newest-wins', () => {
    const newerLocal = createContact({
      fullName: 'Newer Local',
      metadata: { created: '2024-01-01T00:00:00Z', modified: '2025-01-01T00:00:00Z', providerIds: {}, archived: false },
    });

    const result = resolveConflict(newerLocal, remote, 'newest-wins');
    expect(result.winner).toBe('local');
    expect(result.contact.fullName).toBe('Newer Local');
  });

  it('should not resolve with manual strategy', () => {
    const result = resolveConflict(local, remote, 'manual');
    expect(result.resolved).toBe(false);
    expect(result.winner).toBe('none');
  });
});
