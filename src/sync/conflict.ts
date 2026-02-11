import type { Contact } from '../types/index.js';

export type ConflictStrategy = 'local-wins' | 'remote-wins' | 'newest-wins' | 'manual';

export interface ConflictResult {
  resolved: boolean;
  winner: 'local' | 'remote' | 'none';
  contact: Contact;
}

/**
 * Resolve a conflict between local and remote versions of a contact.
 */
export function resolveConflict(
  local: Contact,
  remote: Contact,
  strategy: ConflictStrategy,
): ConflictResult {
  switch (strategy) {
    case 'local-wins':
      return { resolved: true, winner: 'local', contact: local };

    case 'remote-wins':
      return { resolved: true, winner: 'remote', contact: remote };

    case 'newest-wins': {
      const localTime = new Date(local.metadata.modified).getTime();
      const remoteTime = new Date(remote.metadata.modified).getTime();
      if (localTime >= remoteTime) {
        return { resolved: true, winner: 'local', contact: local };
      }
      return { resolved: true, winner: 'remote', contact: remote };
    }

    case 'manual':
      // Can't auto-resolve; return local and flag as unresolved
      return { resolved: false, winner: 'none', contact: local };
  }
}
