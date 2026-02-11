# contacts-mcp Roadmap

## Current State (v0.1.0)

The core is functional: the MCP server runs, all 13 tools and 4 resources work, contacts are stored as git-backed vCards, search/dedup/merge work end-to-end, and provider adapters are written for Google, Apple, and CardDAV.

### What's built and tested

- [x] MCP server with stdio transport (initializes, responds to tool/resource calls)
- [x] Git-backed store — CRUD, soft delete, bulk import, history, rollback
- [x] vCard 4.0 serializer/parser (hand-rolled, no external deps)
- [x] Phone normalization (E.164 via libphonenumber-js)
- [x] Fuzzy search (Fuse.js with weighted fields)
- [x] Duplicate detection with confidence scoring and blocking keys
- [x] Contact merge with union/keep-newest/keep-oldest strategies
- [x] Import from .vcf files with dedup checking
- [x] Export to .vcf, .csv, .json
- [x] Rollback with safety tags (last-n, to-commit, to-tag modes)
- [x] History (global or per-contact via git log)
- [x] Google Contacts provider (People API)
- [x] Apple Contacts provider (JXA/osascript)
- [x] CardDAV provider (tsdav)
- [x] Sync engine with conflict resolution

### What's written but not yet integration-tested with live services

- [ ] Google provider — needs real OAuth credentials to test
- [ ] Apple provider — needs macOS Contacts permission grant to test
- [ ] CardDAV provider — needs a real CardDAV server to test against
- [ ] Full bidirectional sync flow end-to-end

---

## Testing Plan

### Unit Tests (Priority: High)

These cover the core logic that everything else depends on. Use vitest.

**vCard round-trip** (`tests/contacts/vcard.test.ts`)
- Serialize a Contact to vCard and parse it back — every field should survive.
- Test edge cases: empty fields, Unicode names (emoji, CJK, accented chars), long notes with newlines (line folding), multiple emails/phones/addresses.
- Test that vCard UID matches contact.id.
- Test parsing vCards exported from real sources (Google, Apple, Outlook).

**Normalization** (`tests/contacts/normalize.test.ts`)
- Phone: `(555) 123-4567` -> `+15551234567`, `+44 20 7946 0958` -> `+442079460958`, invalid strings stay as-is.
- Email: trim whitespace, lowercase.
- Full contact normalization: phones and emails updated in-place.

**Name parsing** (`tests/contacts/model.test.ts`)
- `"John Doe"` -> `{ givenName: "John", familyName: "Doe" }`.
- `"John Michael Doe"` -> middle name extracted.
- `"Madonna"` -> given name only.
- `hasNameFields` correctly detects empty vs populated name objects.

**Dedup scoring** (`tests/contacts/dedup.test.ts`)
- Same email -> 0.95 confidence.
- Same phone (different formats) -> 0.90.
- Exact name match -> 0.70.
- Fuzzy name: "John Smith" vs "Jon Smith" -> above 0.50.
- Swapped names: "John Smith" vs "Smith, John" -> 0.90.
- Initials: "J. Smith" vs "Jane Smith" -> 0.75.
- Org boost: same org adds 0.15 to existing score.
- No match: completely different contacts -> below threshold.
- Blocking keys: contacts in different blocks are not compared.

**Merge** (`tests/contacts/merge.test.ts`)
- Union: emails, phones, categories combined; no duplicates; longer name wins.
- Keep-newest: takes the most recently modified contact's data.
- Keep-oldest: takes the earliest.
- Field overrides: specify which contact's org to use.
- Provider IDs are merged from all sources.
- Merge 3+ contacts in one call.

**Search** (`tests/contacts/search.test.ts`)
- Exact name match ranks highest.
- Partial match works ("Joh" finds "John").
- Email search works.
- Phone search works.
- Empty query returns all contacts (up to limit).
- Respects limit parameter.

### Store Tests (Priority: High)

**Git store CRUD** (`tests/store/git-store.test.ts`)

Each test gets a fresh temp directory with `git init`.

- Create: file exists at `contacts/<uuid>.vcf`, git log shows commit.
- Read: returns correct Contact, throws ContactNotFoundError for missing.
- Update: file updated, commit message lists changed fields, unchanged fields preserved.
- Delete (soft): file moves to `archive/`, commit message says "Archive".
- Delete (permanent): file removed entirely.
- List: returns all contacts, `includeArchived` flag works.
- Bulk create: single commit for N contacts, pre/post tags created.
- History: returns commits in order, parses operation type from message.
- Rollback last-n: reverts the right number of commits, creates safety tag.
- Rollback to-commit: reverts everything between HEAD and target.
- Merge and archive: primary updated, secondaries moved to archive, merge-log updated.
- Locking: concurrent operations don't corrupt the store.

**Git ops** (`tests/store/git-ops.test.ts`)
- init: creates directories, initializes repo, initial commit exists.
- init on existing repo: no-op, doesn't destroy data.
- add + commit: file tracked, commit hash returned.
- log: returns correct entries, file-scoped log works.
- revert: creates revert commit, file contents restored.
- tag: tag exists in tag list.
- move: file relocated, both paths staged.

### Provider Tests (Priority: Medium)

These need mocks or real credentials. Start with mocks.

**Google provider** (`tests/providers/google.test.ts`)
- Mock `googleapis` — test that `fetchAll` maps Google Person objects to Contact correctly.
- Test field mapping: Google `names[0].givenName` -> `contact.name.givenName`, etc.
- Test `contactToGooglePerson` reverse mapping.
- Test `isConfigured` returns false when credentials missing.

**Apple provider** (`tests/providers/apple.test.ts`)
- Mock `execFile` — test JXA output parsing.
- Test that label mapping works: `_$!<Home>!$_` -> `"home"`.
- Skip on non-macOS CI.

**CardDAV provider** (`tests/providers/carddav.test.ts`)
- Mock `tsdav` `createDAVClient` — test that vCards from server are parsed correctly.
- Test push: correct vCard string sent to `createVCard`.
- Test etag handling for updates.

### Sync Tests (Priority: Medium)

**Diff** (`tests/sync/diff.test.ts`)
- Identical contacts: no diffs.
- Changed name: single diff entry.
- Changed emails: diff captured.
- `hasChanges` returns true/false correctly.

**Conflict resolution** (`tests/sync/conflict.test.ts`)
- `local-wins`: returns local.
- `remote-wins`: returns remote.
- `newest-wins`: returns whichever has later `metadata.modified`.
- `manual`: returns `resolved: false`.

**Sync engine** (`tests/sync/engine.test.ts`)
- Pull: new remote contact imported locally.
- Pull: changed remote contact updates local.
- Push: new local contact pushed to remote.
- Push: only contacts modified since last sync are pushed.
- Conflict: both changed, newest-wins picks the right one.
- Dry run: no actual changes made, counts correct.
- Tags created pre/post sync.

### Integration / E2E Tests (Priority: Medium)

**MCP protocol** (`tests/tools/integration.test.ts`)
- Spawn the server as a child process.
- Send JSON-RPC `initialize` -> get correct capabilities.
- `tools/list` -> all 13 tools present.
- `tools/call create_contact` -> contact created, git commit exists.
- `tools/call search_contacts` -> finds created contact.
- `tools/call find_duplicates` -> detects dupes after creating similar contacts.
- `tools/call merge_contacts` -> merges and archives correctly.
- `tools/call rollback` -> undoes the last operation.
- `tools/call history` -> shows correct entries.
- `resources/list` -> all 4 resources present.
- `resources/read contacts://all` -> returns contact summaries.

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Run specific test file
npx vitest run tests/contacts/vcard.test.ts
```

---

## Future Features

### Near Term (v0.2)

**Testing & reliability**
- [ ] Write all unit tests listed above
- [ ] CI pipeline (GitHub Actions) — lint, typecheck, test on Node 18/20/22
- [ ] Add `eslint` + `prettier` config

**Import/export improvements**
- [ ] CSV import (in addition to vCard import)
- [ ] Import from Google Takeout export files
- [ ] Import from Outlook PST/CSV exports
- [ ] `import_contacts` tool: add `source: "google" | "apple" | "carddav"` to pull directly from a provider without full sync

**Better search**
- [ ] Search by category/tag
- [ ] Search by date ranges (birthday this month, created recently)
- [ ] Return match highlights so the AI can explain why a result was found

**Dedup improvements**
- [ ] `scope: "recent"` option to only check contacts modified in last N days
- [ ] Dedup report as a formatted text summary, not just JSON
- [ ] Auto-merge at high confidence (e.g., > 0.95) with a `autoMerge` flag
- [ ] Cross-provider dedup: detect the same contact in Google and CardDAV

### Medium Term (v0.3)

**Live provider sync**
- [ ] Full integration testing with real Google, Fastmail, iCloud accounts
- [ ] Incremental sync: use `syncToken` (Google) and `ctag`/`etag` (CardDAV) instead of fetching all contacts every time
- [ ] Deletion sync: detect contacts deleted on the remote side and archive locally
- [ ] Sync scheduling hint: report `lastSync` and `contactCount` per provider so the AI can decide when to sync

**Contact groups / lists**
- [ ] First-class support for contact groups (vCard `MEMBER` property, Google contact groups)
- [ ] `create_group`, `add_to_group`, `remove_from_group` tools
- [ ] Group-scoped operations: search within a group, export a group, dedup within a group

**Contact enrichment**
- [ ] Gravatar/profile photo lookup by email
- [ ] Social profile linking (LinkedIn, Twitter/X, GitHub) via URL detection in contact URLs
- [ ] Timezone inference from phone number country code or address

**MCP prompts**
- [ ] `review-duplicates` prompt: AI walks through duplicate candidates and asks user how to resolve each one
- [ ] `contact-cleanup` prompt: AI scans for issues (missing names, invalid emails, orphaned phones) and proposes fixes
- [ ] `import-review` prompt: AI previews an import, highlights conflicts, asks for decisions

### Longer Term (v0.4+)

**Multi-user / shared stores**
- [ ] Support for multiple named contact stores (personal, work, family)
- [ ] `switch_store` tool
- [ ] Cross-store search and dedup

**Advanced sync**
- [ ] Real-time sync via webhooks (Google push notifications, CardDAV sync-collection)
- [ ] Three-way merge for conflicts (common ancestor from git history)
- [ ] Sync conflict queue: store unresolved conflicts, let the AI resolve them interactively

**Performance**
- [ ] Lazy loading: don't parse all vCards on every `list` call — cache parsed contacts in memory
- [ ] Index file for faster search (persist Fuse.js index)
- [ ] Batch git operations: group multiple changes into a single commit when doing bulk edits

**Interoperability**
- [ ] LDAP provider (for corporate directories)
- [ ] Microsoft Graph provider (Outlook/Exchange contacts)
- [ ] Airtable / Notion provider (for CRM-style contact databases)
- [ ] Webhook provider: POST to a URL on every contact change

**CLI**
- [ ] Standalone CLI mode (`contacts-mcp cli search "John"`) for use outside MCP
- [ ] Interactive TUI for reviewing duplicates and resolving merges

**Photo handling**
- [ ] Store contact photos as separate files in the git repo (instead of inline base64)
- [ ] Photo sync with providers
- [ ] Photo dedup (detect same photo across contacts)

---

## Architecture Decisions & Rationale

### Why vCard files in git?

- **Standard format**: vCard 4.0 (RFC 6350) is universally supported. The files are human-readable and can be opened in any contact app.
- **Git gives us versioning for free**: every mutation is a commit, rollback is `git revert`, history is `git log`, diffs are `git diff`. No custom versioning code needed.
- **One file per contact**: enables per-contact history (`git log contacts/uuid.vcf`), clean diffs, and merge-friendly storage.
- **Portable**: the store is just a directory. Copy it, back it up, push it to a remote, clone it on another machine.

### Why not SQLite?

SQLite would be faster for large datasets and enables SQL queries, but:
- You can't diff a SQLite binary meaningfully in git.
- Rollback requires custom event-sourcing or WAL replay.
- The files aren't human-readable or portable to other contact tools.

For the scale this targets (personal/small business contacts, typically under 10k), vCard-in-git is fast enough and much simpler to reason about.

### Why a custom vCard parser?

The npm ecosystem for vCard is fragmented — most libraries are abandoned, partially implement the spec, or have awkward APIs. Our parser is ~330 lines, handles the subset of RFC 6350 that matters for contacts, and does clean round-trips. It's easy to extend when we need a new property.

### Why blocking keys for dedup?

Comparing every pair of N contacts is O(N^2). With 5,000 contacts that's 12.5 million comparisons. Blocking keys (group by first letter of names, email domain, phone suffix) reduce this to O(N) in practice while missing very few true duplicates. The theoretical miss rate is low because real duplicates almost always share at least one blocking key.

---

## Contributing

### Development Setup

```bash
git clone <repo>
cd contacts-mcp
npm install
npm run build
```

### Code Style

- TypeScript strict mode, ES2022 target, Node16 module resolution.
- All logging goes to `stderr` (critical for stdio MCP servers — `stdout` is the JSON-RPC transport).
- Provider adapters follow the `ContactProvider` interface in `src/types/provider.ts`.
- Each MCP tool is a separate file in `src/tools/` with a `register*Tool` function.

### Adding a New Provider

1. Create `src/providers/yourprovider.ts` extending `BaseProvider`.
2. Implement `fetchAll`, `fetchOne`, `pushContact`, `updateContact`, `deleteContact`.
3. Export it from `src/providers/index.ts`.
4. Add the provider type to the `ProviderConfig.type` union in `src/types/provider.ts`.
5. Wire it up in the sync tool and list_providers tool.

### Adding a New Tool

1. Create `src/tools/yourtool.ts` with a `registerYourTool(server, store)` function.
2. Use `server.registerTool()` with Zod schemas for input validation.
3. Import and call it from `src/tools/index.ts`.
