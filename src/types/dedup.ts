import type { Contact, ContactSummary } from './contact.js';

export interface MatchedField {
  field: string;
  valueA: string;
  valueB: string;
  similarity: number;
  matchType: 'exact' | 'fuzzy' | 'normalized';
}

export interface DuplicateCandidate {
  contactA: ContactSummary;
  contactB: ContactSummary;
  confidence: number;
  matchedFields: MatchedField[];
}

export type MergeStrategy = 'keep-newest' | 'keep-oldest' | 'union';

export interface MergeResult {
  mergedContact: Contact;
  sourceContactIds: string[];
  fieldsFromEach: Record<string, string>;
}
