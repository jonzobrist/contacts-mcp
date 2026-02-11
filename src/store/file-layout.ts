import * as path from 'node:path';

export const CONTACTS_DIR = 'contacts';
export const ARCHIVE_DIR = 'archive';
export const METADATA_DIR = '.metadata';

export function contactPath(storePath: string, id: string): string {
  return path.join(storePath, CONTACTS_DIR, `${id}.vcf`);
}

export function archivePath(storePath: string, id: string): string {
  return path.join(storePath, ARCHIVE_DIR, `${id}.vcf`);
}

export function metadataPath(storePath: string, filename: string): string {
  return path.join(storePath, METADATA_DIR, filename);
}

export function relativeContactPath(id: string): string {
  return `${CONTACTS_DIR}/${id}.vcf`;
}

export function relativeArchivePath(id: string): string {
  return `${ARCHIVE_DIR}/${id}.vcf`;
}

/** Extract contact ID from a file path like "contacts/abc-123.vcf" */
export function extractIdFromPath(filePath: string): string | undefined {
  const match = filePath.match(/(?:contacts|archive)\/([^/]+)\.vcf$/);
  return match?.[1];
}
