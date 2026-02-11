import type { Contact, ContactEmail, ContactPhone, ContactAddress, ContactUrl } from '../types/index.js';
import { createContact } from './model.js';

/**
 * Serialize a Contact to vCard 4.0 format (RFC 6350).
 */
export function contactToVCard(contact: Contact): string {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:4.0',
    `UID:urn:uuid:${contact.id}`,
    `FN:${escapeVCardValue(contact.fullName)}`,
  ];

  // N (structured name)
  const n = contact.name;
  lines.push(
    `N:${escapeVCardValue(n.familyName ?? '')};${escapeVCardValue(n.givenName ?? '')};${escapeVCardValue(n.middleName ?? '')};${escapeVCardValue(n.prefix ?? '')};${escapeVCardValue(n.suffix ?? '')}`
  );

  // Emails
  for (const email of contact.emails) {
    const params: string[] = [];
    if (email.type) params.push(`TYPE=${email.type}`);
    if (email.primary) params.push('PREF=1');
    const paramStr = params.length ? `;${params.join(';')}` : '';
    lines.push(`EMAIL${paramStr}:${escapeVCardValue(email.value)}`);
  }

  // Phones
  for (const phone of contact.phones) {
    const params: string[] = [];
    if (phone.type) params.push(`TYPE=${phone.type}`);
    if (phone.primary) params.push('PREF=1');
    const paramStr = params.length ? `;${params.join(';')}` : '';
    lines.push(`TEL${paramStr}:${escapeVCardValue(phone.value)}`);
  }

  // Addresses
  for (const addr of contact.addresses) {
    const params: string[] = [];
    if (addr.type) params.push(`TYPE=${addr.type}`);
    const paramStr = params.length ? `;${params.join(';')}` : '';
    // ADR: PO Box;Ext Address;Street;City;State;Postal;Country
    lines.push(
      `ADR${paramStr}:;;${escapeVCardValue(addr.street ?? '')};${escapeVCardValue(addr.city ?? '')};${escapeVCardValue(addr.state ?? '')};${escapeVCardValue(addr.postalCode ?? '')};${escapeVCardValue(addr.country ?? '')}`
    );
  }

  // Organization
  if (contact.organization?.name) {
    lines.push(`ORG:${escapeVCardValue(contact.organization.name)}${contact.organization.department ? `;${escapeVCardValue(contact.organization.department)}` : ''}`);
  }
  if (contact.organization?.title) {
    lines.push(`TITLE:${escapeVCardValue(contact.organization.title)}`);
  }

  // Birthday
  if (contact.birthday) {
    lines.push(`BDAY:${contact.birthday}`);
  }

  // Anniversary
  if (contact.anniversary) {
    lines.push(`ANNIVERSARY:${contact.anniversary}`);
  }

  // URLs
  for (const url of contact.urls) {
    const params: string[] = [];
    if (url.type) params.push(`TYPE=${url.type}`);
    const paramStr = params.length ? `;${params.join(';')}` : '';
    lines.push(`URL${paramStr}:${escapeVCardValue(url.value)}`);
  }

  // Notes
  if (contact.notes) {
    lines.push(`NOTE:${escapeVCardValue(contact.notes)}`);
  }

  // Categories
  if (contact.categories.length > 0) {
    lines.push(`CATEGORIES:${contact.categories.map(escapeVCardValue).join(',')}`);
  }

  // Photo
  if (contact.photo) {
    lines.push(`PHOTO:${contact.photo}`);
  }

  // Metadata as X-properties
  lines.push(`REV:${contact.metadata.modified}`);
  if (contact.metadata.source) {
    lines.push(`X-CONTACTS-MCP-SOURCE:${escapeVCardValue(contact.metadata.source)}`);
  }
  if (Object.keys(contact.metadata.providerIds).length > 0) {
    lines.push(`X-CONTACTS-MCP-PROVIDER-IDS:${escapeVCardValue(JSON.stringify(contact.metadata.providerIds))}`);
  }
  lines.push(`X-CONTACTS-MCP-CREATED:${contact.metadata.created}`);
  if (contact.metadata.archived) {
    lines.push('X-CONTACTS-MCP-ARCHIVED:true');
  }

  lines.push('END:VCARD');

  return foldLines(lines.join('\r\n'));
}

/**
 * Parse a vCard 4.0 string into a Contact object.
 */
export function vcardToContact(vcard: string): Contact {
  const lines = unfoldLines(vcard);
  const props = parseProperties(lines);

  const id = extractUid(props.get('UID') ?? '') ?? '';
  const fullName = unescapeVCardValue(getFirstValue(props, 'FN') ?? 'Unknown');

  // Parse structured name
  const nValue = getFirstValue(props, 'N') ?? ';;;;';
  const nParts = nValue.split(';').map(unescapeVCardValue);
  const name = {
    familyName: nParts[0] || undefined,
    givenName: nParts[1] || undefined,
    middleName: nParts[2] || undefined,
    prefix: nParts[3] || undefined,
    suffix: nParts[4] || undefined,
  };

  // Parse emails
  const emails: ContactEmail[] = (props.getAll('EMAIL') ?? []).map(p => ({
    value: unescapeVCardValue(p.value),
    type: extractType(p.params) as ContactEmail['type'],
    primary: p.params.some(p => p.toUpperCase().startsWith('PREF')),
  }));

  // Parse phones
  const phones: ContactPhone[] = (props.getAll('TEL') ?? []).map(p => ({
    value: unescapeVCardValue(p.value),
    type: extractType(p.params) as ContactPhone['type'],
    primary: p.params.some(p => p.toUpperCase().startsWith('PREF')),
  }));

  // Parse addresses
  const addresses: ContactAddress[] = (props.getAll('ADR') ?? []).map(p => {
    const parts = p.value.split(';').map(unescapeVCardValue);
    return {
      street: parts[2] || undefined,
      city: parts[3] || undefined,
      state: parts[4] || undefined,
      postalCode: parts[5] || undefined,
      country: parts[6] || undefined,
      type: extractType(p.params) as ContactAddress['type'],
    };
  });

  // Organization
  const orgValue = getFirstValue(props, 'ORG');
  const titleValue = getFirstValue(props, 'TITLE');
  const organization = (orgValue || titleValue) ? {
    name: orgValue ? unescapeVCardValue(orgValue.split(';')[0]) : undefined,
    department: orgValue?.includes(';') ? unescapeVCardValue(orgValue.split(';')[1]) : undefined,
    title: titleValue ? unescapeVCardValue(titleValue) : undefined,
  } : undefined;

  // URLs
  const urls: ContactUrl[] = (props.getAll('URL') ?? []).map(p => ({
    value: unescapeVCardValue(p.value),
    type: extractType(p.params) as ContactUrl['type'],
  }));

  // Simple properties
  const birthday = getFirstValue(props, 'BDAY');
  const anniversary = getFirstValue(props, 'ANNIVERSARY');
  const notes = getFirstValue(props, 'NOTE') ? unescapeVCardValue(getFirstValue(props, 'NOTE')!) : undefined;
  const photo = getFirstValue(props, 'PHOTO');
  const rev = getFirstValue(props, 'REV');

  // Categories
  const catValue = getFirstValue(props, 'CATEGORIES');
  const categories = catValue ? catValue.split(',').map(unescapeVCardValue) : [];

  // Metadata from X-properties
  const source = getFirstValue(props, 'X-CONTACTS-MCP-SOURCE');
  const providerIdsRaw = getFirstValue(props, 'X-CONTACTS-MCP-PROVIDER-IDS');
  let providerIds: Record<string, string> = {};
  if (providerIdsRaw) {
    try { providerIds = JSON.parse(unescapeVCardValue(providerIdsRaw)); } catch { /* ignore */ }
  }
  const created = getFirstValue(props, 'X-CONTACTS-MCP-CREATED') ?? rev ?? new Date().toISOString();
  const archived = getFirstValue(props, 'X-CONTACTS-MCP-ARCHIVED') === 'true';

  return createContact({
    id,
    fullName,
    name,
    emails,
    phones,
    addresses,
    organization,
    birthday,
    anniversary,
    urls,
    notes,
    categories,
    photo,
    metadata: {
      created,
      modified: rev ?? new Date().toISOString(),
      source: source ? unescapeVCardValue(source) : undefined,
      providerIds,
      archived,
    },
  });
}

// --- Helpers ---

interface VCardProperty {
  name: string;
  params: string[];
  value: string;
}

class PropertyMap {
  private entries: VCardProperty[] = [];

  add(prop: VCardProperty): void {
    this.entries.push(prop);
  }

  get(name: string): string | undefined {
    return this.entries.find(e => e.name === name.toUpperCase())?.value;
  }

  getAll(name: string): VCardProperty[] {
    return this.entries.filter(e => e.name === name.toUpperCase());
  }
}

function getFirstValue(props: PropertyMap, name: string): string | undefined {
  return props.get(name);
}

function parseProperties(lines: string[]): PropertyMap {
  const map = new PropertyMap();
  for (const line of lines) {
    if (!line.includes(':')) continue;
    const colonIdx = line.indexOf(':');
    const left = line.substring(0, colonIdx);
    const value = line.substring(colonIdx + 1);

    const parts = left.split(';');
    const name = parts[0].toUpperCase();
    const params = parts.slice(1);

    if (name === 'BEGIN' || name === 'END') continue;

    map.add({ name, params, value });
  }
  return map;
}

function extractUid(value: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/^urn:uuid:/, '');
}

function extractType(params: string[]): string | undefined {
  for (const p of params) {
    const upper = p.toUpperCase();
    if (upper.startsWith('TYPE=')) {
      return p.substring(5).toLowerCase();
    }
  }
  return undefined;
}

function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function unescapeVCardValue(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** RFC 6350 line folding: lines longer than 75 octets are folded with CRLF + space. */
function foldLines(text: string): string {
  return text.split('\r\n').map(line => {
    if (Buffer.byteLength(line, 'utf-8') <= 75) return line;
    const result: string[] = [];
    let remaining = line;
    let first = true;
    while (Buffer.byteLength(remaining, 'utf-8') > 75) {
      let cutPoint = first ? 75 : 74; // subsequent lines lose 1 byte to leading space
      // Don't cut in the middle of a multi-byte char
      while (cutPoint > 0 && Buffer.byteLength(remaining.substring(0, cutPoint), 'utf-8') > (first ? 75 : 74)) {
        cutPoint--;
      }
      result.push(remaining.substring(0, cutPoint));
      remaining = remaining.substring(cutPoint);
      first = false;
    }
    if (remaining) result.push(remaining);
    return result.join('\r\n ');
  }).join('\r\n');
}

/** Unfold continuation lines (lines starting with space or tab). */
function unfoldLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && result.length > 0) {
      result[result.length - 1] += line.substring(1);
    } else {
      result.push(line);
    }
  }
  return result.filter(l => l.length > 0);
}
