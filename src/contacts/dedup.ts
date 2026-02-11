import type { Contact, DuplicateCandidate, MatchedField } from '../types/index.js';
import { toSummary } from '../types/index.js';
import { normalizeEmail, normalizePhone } from './normalize.js';

interface DedupOptions {
  threshold?: number;
  limit?: number;
}

export function findDuplicates(
  contacts: Contact[],
  options: DedupOptions = {},
): DuplicateCandidate[] {
  const threshold = options.threshold ?? 0.6;
  const limit = options.limit ?? 50;
  const candidates: DuplicateCandidate[] = [];

  // Build blocking keys to reduce O(n^2) comparisons
  const blocks = buildBlocks(contacts);

  const seen = new Set<string>();

  for (const block of blocks.values()) {
    for (let i = 0; i < block.length; i++) {
      for (let j = i + 1; j < block.length; j++) {
        const a = block[i];
        const b = block[j];
        const pairKey = [a.id, b.id].sort().join(':');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        const result = compareContacts(a, b);
        if (result.confidence >= threshold) {
          candidates.push({
            contactA: toSummary(a),
            contactB: toSummary(b),
            confidence: result.confidence,
            matchedFields: result.matchedFields,
          });
        }
      }
    }
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates.slice(0, limit);
}

function compareContacts(a: Contact, b: Contact): { confidence: number; matchedFields: MatchedField[] } {
  let score = 0;
  const matchedFields: MatchedField[] = [];

  // Email matching
  const emailsA = new Set(a.emails.map(e => normalizeEmail(e.value)));
  const emailsB = new Set(b.emails.map(e => normalizeEmail(e.value)));
  for (const email of emailsA) {
    if (emailsB.has(email)) {
      score = Math.max(score, 0.95);
      matchedFields.push({
        field: 'email',
        valueA: email,
        valueB: email,
        similarity: 1.0,
        matchType: 'exact',
      });
      break;
    }
  }

  // Phone matching (normalized)
  const phonesA = new Set(a.phones.map(p => normalizePhone(p.value)));
  const phonesB = new Set(b.phones.map(p => normalizePhone(p.value)));
  for (const phone of phonesA) {
    if (phonesB.has(phone)) {
      score = Math.max(score, 0.90);
      matchedFields.push({
        field: 'phone',
        valueA: phone,
        valueB: phone,
        similarity: 1.0,
        matchType: 'normalized',
      });
      break;
    }
  }

  // Name matching
  const nameSim = computeNameSimilarity(a, b);
  if (nameSim >= 0.85) {
    score = Math.max(score, 0.70);
    matchedFields.push({
      field: 'name',
      valueA: a.fullName,
      valueB: b.fullName,
      similarity: nameSim,
      matchType: nameSim === 1.0 ? 'exact' : 'fuzzy',
    });
  } else if (nameSim >= 0.65) {
    score = Math.max(score, 0.50);
    matchedFields.push({
      field: 'name',
      valueA: a.fullName,
      valueB: b.fullName,
      similarity: nameSim,
      matchType: 'fuzzy',
    });
  }

  // Organization boost (additive, not standalone)
  if (a.organization?.name && b.organization?.name &&
      a.organization.name.toLowerCase() === b.organization.name.toLowerCase()) {
    if (score > 0) {
      score = Math.min(1.0, score + 0.15);
      matchedFields.push({
        field: 'organization',
        valueA: a.organization.name,
        valueB: b.organization.name,
        similarity: 1.0,
        matchType: 'exact',
      });
    }
  }

  return { confidence: Math.round(score * 100) / 100, matchedFields };
}

function computeNameSimilarity(a: Contact, b: Contact): number {
  const nameA = a.fullName.toLowerCase().trim();
  const nameB = b.fullName.toLowerCase().trim();

  if (nameA === nameB) return 1.0;

  // Component-wise (handles "John Smith" vs "Smith, John")
  const givenA = (a.name.givenName ?? '').toLowerCase();
  const familyA = (a.name.familyName ?? '').toLowerCase();
  const givenB = (b.name.givenName ?? '').toLowerCase();
  const familyB = (b.name.familyName ?? '').toLowerCase();

  // Direct component match
  if (givenA && familyA && givenB && familyB) {
    if (givenA === givenB && familyA === familyB) return 1.0;
    // Swapped names
    if (givenA === familyB && familyA === givenB) return 0.90;
  }

  // Initials match: "J. Smith" == "John Smith"
  if (givenA && givenB && familyA && familyB) {
    if (familyA === familyB && (givenA[0] === givenB[0]) && (givenA.length === 1 || givenB.length === 1)) {
      return 0.75;
    }
  }

  // Levenshtein-based fuzzy match on full name
  const levDist = levenshtein(nameA, nameB);
  const maxLen = Math.max(nameA.length, nameB.length);
  if (maxLen === 0) return 1.0;
  return Math.max(0, 1 - levDist / maxLen);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Build blocking groups to reduce comparison count. */
function buildBlocks(contacts: Contact[]): Map<string, Contact[]> {
  const blocks = new Map<string, Contact[]>();

  for (const contact of contacts) {
    const keys = new Set<string>();

    // Block by first letter of given + family name
    const g = (contact.name.givenName ?? contact.fullName.split(' ')[0] ?? '')[0]?.toLowerCase() ?? '';
    const f = (contact.name.familyName ?? contact.fullName.split(' ').pop() ?? '')[0]?.toLowerCase() ?? '';
    if (g || f) keys.add(`name:${g}${f}`);

    // Block by email domain
    for (const email of contact.emails) {
      const domain = email.value.split('@')[1]?.toLowerCase();
      if (domain) keys.add(`domain:${domain}`);
    }

    // Block by phone area code (last 7 digits for local matching)
    for (const phone of contact.phones) {
      const digits = phone.value.replace(/\D/g, '');
      if (digits.length >= 7) {
        keys.add(`phone:${digits.slice(-7)}`);
      }
    }

    for (const key of keys) {
      let block = blocks.get(key);
      if (!block) {
        block = [];
        blocks.set(key, block);
      }
      block.push(contact);
    }
  }

  return blocks;
}
