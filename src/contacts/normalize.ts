import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { Contact, ContactPhone } from '../types/index.js';

/** Normalize a phone number to E.164 format. Returns original if parsing fails. */
export function normalizePhone(raw: string, defaultCountry: string = 'US'): string {
  const parsed = parsePhoneNumberFromString(raw, defaultCountry as any);
  if (parsed && (parsed.isValid() || parsed.isPossible())) {
    return parsed.format('E.164');
  }
  // Fallback: strip formatting characters
  const stripped = raw.replace(/[\s\-\(\)\.]/g, '');
  return stripped || raw;
}

/** Normalize an email address (lowercase, trim). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalize all phone numbers and emails on a contact in-place and return it. */
export function normalizeContact(contact: Contact): Contact {
  // Normalize emails
  for (const email of contact.emails) {
    email.value = normalizeEmail(email.value);
  }

  // Normalize phones
  for (const phone of contact.phones) {
    const normalized = normalizePhone(phone.value);
    if (normalized !== phone.value) {
      phone.originalValue = phone.value;
      phone.value = normalized;
    }
  }

  // Normalize name - trim whitespace
  contact.fullName = contact.fullName.trim();
  if (contact.name.givenName) contact.name.givenName = contact.name.givenName.trim();
  if (contact.name.familyName) contact.name.familyName = contact.name.familyName.trim();
  if (contact.name.middleName) contact.name.middleName = contact.name.middleName.trim();

  return contact;
}
