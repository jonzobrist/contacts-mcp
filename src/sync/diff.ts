import type { Contact } from '../types/index.js';

export interface FieldDiff {
  field: string;
  localValue: unknown;
  remoteValue: unknown;
}

/**
 * Compare two versions of the same contact and return the changed fields.
 */
export function diffContacts(local: Contact, remote: Contact): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  if (local.fullName !== remote.fullName) {
    diffs.push({ field: 'fullName', localValue: local.fullName, remoteValue: remote.fullName });
  }

  if (JSON.stringify(local.name) !== JSON.stringify(remote.name)) {
    diffs.push({ field: 'name', localValue: local.name, remoteValue: remote.name });
  }

  if (JSON.stringify(local.emails) !== JSON.stringify(remote.emails)) {
    diffs.push({ field: 'emails', localValue: local.emails, remoteValue: remote.emails });
  }

  if (JSON.stringify(local.phones) !== JSON.stringify(remote.phones)) {
    diffs.push({ field: 'phones', localValue: local.phones, remoteValue: remote.phones });
  }

  if (JSON.stringify(local.addresses) !== JSON.stringify(remote.addresses)) {
    diffs.push({ field: 'addresses', localValue: local.addresses, remoteValue: remote.addresses });
  }

  if (JSON.stringify(local.organization) !== JSON.stringify(remote.organization)) {
    diffs.push({ field: 'organization', localValue: local.organization, remoteValue: remote.organization });
  }

  if (local.birthday !== remote.birthday) {
    diffs.push({ field: 'birthday', localValue: local.birthday, remoteValue: remote.birthday });
  }

  if (local.notes !== remote.notes) {
    diffs.push({ field: 'notes', localValue: local.notes, remoteValue: remote.notes });
  }

  if (JSON.stringify(local.categories) !== JSON.stringify(remote.categories)) {
    diffs.push({ field: 'categories', localValue: local.categories, remoteValue: remote.categories });
  }

  return diffs;
}

/** Check if two contacts have any meaningful differences. */
export function hasChanges(local: Contact, remote: Contact): boolean {
  return diffContacts(local, remote).length > 0;
}
