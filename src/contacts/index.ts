export { createContact, parseName } from './model.js';
export { contactToVCard, vcardToContact } from './vcard.js';
export { normalizeContact, normalizeEmail, normalizePhone } from './normalize.js';
export { searchContacts } from './search.js';
export { findDuplicates } from './dedup.js';
export { mergeContacts } from './merge.js';
export { resolveContactPoints } from './resolve.js';
export { importVCardFile } from './import.js';
export type { ImportVCardOptions, ImportVCardResult } from './import.js';
export type {
  ContactPointQuery,
  ResolvedContactPoint,
  ResolveContactPointsInput,
  ResolveContactPointsResult,
} from './resolve.js';
