import type { Contact, ContactProvider, SyncResult } from '../types/index.js';
import type { GitContactStore } from '../store/index.js';
import { diffContacts, hasChanges } from './diff.js';
import { resolveConflict, type ConflictStrategy } from './conflict.js';
import { normalizeContact } from '../contacts/normalize.js';
import { logger } from '../utils/index.js';

export interface SyncOptions {
  direction: 'pull' | 'push' | 'both';
  conflictStrategy: ConflictStrategy;
  dryRun: boolean;
}

export class SyncEngine {
  private store: GitContactStore;

  constructor(store: GitContactStore) {
    this.store = store;
  }

  async sync(provider: ContactProvider, options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      provider: provider.name,
      pulled: 0,
      pushed: 0,
      conflicts: 0,
      errors: [],
      duration: 0,
    };

    try {
      // Tag before sync
      await this.store.gitOps.tag(`pre-sync-${provider.name}-${Date.now()}`);

      if (options.direction === 'pull' || options.direction === 'both') {
        await this.pull(provider, options, result);
      }

      if (options.direction === 'push' || options.direction === 'both') {
        await this.push(provider, options, result);
      }

      // Update sync time
      if (!options.dryRun) {
        await provider.setLastSyncTime(new Date().toISOString());
      }

      // Tag after sync
      await this.store.gitOps.tag(`post-sync-${provider.name}-${Date.now()}`);
    } catch (err: any) {
      result.errors.push(err.message);
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  private async pull(
    provider: ContactProvider,
    options: SyncOptions,
    result: SyncResult,
  ): Promise<void> {
    const remoteContacts = await provider.fetchAll();
    const localContacts = await this.store.list(false);

    // Build lookup by provider remote ID
    const localByRemoteId = new Map<string, Contact>();
    for (const local of localContacts) {
      const remoteId = local.metadata.providerIds[provider.name];
      if (remoteId) localByRemoteId.set(remoteId, local);
    }

    for (const remote of remoteContacts) {
      const remoteId = remote.metadata.providerIds[provider.name];
      if (!remoteId) continue;

      const local = localByRemoteId.get(remoteId);

      if (!local) {
        // New contact from remote - import it
        if (!options.dryRun) {
          try {
            const normalized = normalizeContact(remote);
            await this.store.create(normalized);
            result.pulled++;
          } catch (err: any) {
            result.errors.push(`Pull create error: ${err.message}`);
          }
        } else {
          result.pulled++;
        }
      } else if (hasChanges(local, remote)) {
        // Contact exists locally and has changes
        const localModified = new Date(local.metadata.modified).getTime();
        const remoteModified = new Date(remote.metadata.modified).getTime();

        if (localModified !== remoteModified) {
          // Potential conflict
          const resolution = resolveConflict(local, remote, options.conflictStrategy);

          if (!resolution.resolved) {
            result.conflicts++;
            continue;
          }

          if (resolution.winner === 'remote' && !options.dryRun) {
            try {
              await this.store.update(local.id, remote);
              result.pulled++;
            } catch (err: any) {
              result.errors.push(`Pull update error for ${local.id}: ${err.message}`);
            }
          }
        }
      }
    }
  }

  private async push(
    provider: ContactProvider,
    options: SyncOptions,
    result: SyncResult,
  ): Promise<void> {
    const localContacts = await this.store.list(false);
    const lastSync = await provider.getLastSyncTime();
    const lastSyncTime = lastSync ? new Date(lastSync).getTime() : 0;

    for (const local of localContacts) {
      const remoteId = local.metadata.providerIds[provider.name];
      const localModified = new Date(local.metadata.modified).getTime();

      // Only push contacts modified since last sync
      if (localModified <= lastSyncTime) continue;

      if (!remoteId) {
        // New local contact - push to remote
        if (!options.dryRun) {
          try {
            const newRemoteId = await provider.pushContact(local);
            // Update local contact with remote ID
            local.metadata.providerIds[provider.name] = newRemoteId;
            await this.store.update(local.id, {
              metadata: local.metadata,
            } as any);
            result.pushed++;
          } catch (err: any) {
            result.errors.push(`Push create error for ${local.id}: ${err.message}`);
          }
        } else {
          result.pushed++;
        }
      } else {
        // Existing contact - update remote
        if (!options.dryRun) {
          try {
            await provider.updateContact(remoteId, local);
            result.pushed++;
          } catch (err: any) {
            result.errors.push(`Push update error for ${local.id}: ${err.message}`);
          }
        } else {
          result.pushed++;
        }
      }
    }
  }
}
