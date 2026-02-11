export interface CommitInfo {
  hash: string;
  message: string;
  date: string;
  author: string;
}

export interface HistoryEntry {
  commit: CommitInfo;
  contactId?: string;
  operation: 'create' | 'update' | 'delete' | 'merge' | 'import' | 'sync' | 'rollback';
  summary: string;
}
