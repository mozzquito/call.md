# Design: Thai Translation, Recording Import, Second-Opinion Summary

**Status**: Features 1-4 implemented, live-tested, committed, and pushed to
`mozzquito/call.md` (commits `3217122`, `d8c009d`, `a6c0cb8`, `66ce19e`) as of 2026-09-05.
Feature 5 (from the same follow-up feature-suggestion round as Feature 4) implemented
same day, pending live test and commit.
**Scope**: Personal fork (mozzquito/call.md), solo use, not intended for upstream PR.
**Design reviewed by**: zcode (GLM) and agy (Gemini), 2026-09-04 (design stage) and
2026-09-05 (diff stage, per feature).

## Constraints (must not touch)

- Real-time STT engine (AssemblyAI via VideoDB) — Thai isn't supported for streaming yet,
  only batch. Do not attempt to work around this.
- Renderer sandbox (`contextIsolation: true`, `sandbox: true`, no `nodeIntegration`) — no
  new renderer→main privileged surface beyond existing IPC whitelist patterns.
- Encrypted-credential architecture (`safeStorage` via `secure-store.ts`) — any new secret
  goes through this, never plaintext.
- Loopback-only server (`127.0.0.1`, CORS restricted) — unchanged.

---

## Feature 1: Live EN→TH Translation Overlay — IMPLEMENTED 2026-09-04

**Goal**: show a Thai translation line under each live English transcript segment.
Does NOT make transcription itself support Thai (blocked upstream at AssemblyAI).

### Architecture (as actually built — revised from the original push-event plan below)

While implementing, a key fact surfaced that the original plan below missed: the live
`TranscriptionPanel.tsx` renders from `transcription.store.ts`, fed directly by the RAW
recorder event in `useGlobalRecorderEvents.ts` — a *separate* pipeline from the backend
copilot's `TranscriptBufferService`/`segment-ready` (which only runs when a copilot call is
active, and generates its own UUID unrelated to the renderer's item ids). The two pipelines
observe the same underlying transcript stream but have no shared id. Given that, a push-event
design keyed by `segmentId` (the original plan) doesn't work without deeper surgery to unify
the two pipelines. What got built instead:

- **Request/response IPC, not a push-event channel.** `useGlobalRecorderEvents.ts` calls
  `translation.translateSegment({recordingId, sessionId, channel, text})` right after
  `transcription.finalizePending(...)` returns the created store item; the item's id is
  captured via closure and used to apply the result when the promise resolves. No
  cross-call ordering to get wrong — each call is self-contained.
- `src/main/services/copilot/translation.service.ts`: `translateSegment(sessionId, text,
  priorContext)` → `getLLMService().complete(...)` (existing VideoDB OpenAI-proxy client, no
  new credentials). `priorContext` is captured by the IPC handler **before** enqueueing
  (`getTranscriptBuffer().getRecentContext(sessionId, 2)`) — not inside the queued task,
  which would read stale context by the time a concurrency-2 queue gets to it.
- **Concurrency-limited queue (2)** in `translation.service.ts` — bounds concurrent LLM
  calls during fast speech.
- DB: nullable `translatedText` column added to `transcriptSegments` (via the existing
  `addColumnIfMissing`-style migration in `db/index.ts`, not a Drizzle-kit migration file —
  this project applies schema changes as raw `ALTER TABLE` on startup, see
  `ensureTranscriptSegmentColumns()`). **Persisted by matching (recordingId, channel, text)**,
  not segment id — same root cause as above (the renderer has no segment UUID to send). See
  the known-limitation comment on `updateTranscriptSegmentTranslationByText` in `db/index.ts`.
- IPC handler validates input (text length cap, channel enum, recordingId type) and logs
  when a persist attempt matches zero rows, so a broken text-match assumption is visible in
  logs rather than silently dropping data.
- Renderer guards against applying a stale result after the session has already ended
  (checks current `sessionId` before calling `setTranslation`).
- UI: Settings → Transcription has a toggle ("Live Thai Translation", labeled Beta). Each
  segment bubble in `TranscriptionPanel.tsx` gets a second line, populated once the
  translation resolves (typically 1–3s behind the English line).

Reviewed by zcode + agy against the actual diff (not just this plan) — both independently
flagged the context-snapshot-timing race and the missing input validation; both fixed above.

---

## Feature 2: Import & Batch-Process Existing Recordings — IMPLEMENTED 2026-09-05

**Goal**: manually import a video/audio file (e.g. a Google Meet recording already
downloaded from Drive) and get transcript + summary, including Thai (batch transcription
supports Thai even though live streaming doesn't).

**Explicitly out of scope for v1**: no Google Drive API/OAuth integration (user downloads
the file themselves first), no in-app playback of imported video (transcript + summary
only — playback would require a loopback media server or custom protocol to satisfy
`webSecurity`, not worth the complexity for v1).

### Architecture (as actually built — revised from the plan below)

- **File picker runs entirely in the Main process** (`dialog.showOpenDialog`), never accepts
  a renderer-supplied path — exactly as planned. IPC handler `import:select-and-upload`
  (a plain IPC handler, not a tRPC procedure as originally sketched — matches the pattern
  Feature 1's translation handler already established). Renderer just says "user clicked
  Import," gets back `{ recordingId }` or `{ cancelled: true }`.
- **No new progress-event channel.** While implementing, found that `HistoryView.tsx`
  already polls `recordings.list` every 10s (`refetchInterval: 10000`) and already renders
  a "Processing" badge with a spinner for `status === 'processing'`. Reusing that (the
  import handler just sets `status: 'processing'` → `'available'`/`'failed'` on the same
  `recordings` row) gives identical UX to a live recording's processing state, for free —
  simpler than the originally-planned `import:progress`/`import:completed` push events.
- VideoDB Node SDK's `collection.uploadFile({ filePath })` (confirmed against the installed
  package's actual `.d.ts`, not assumed) uploads the file; `asset.generateTranscript(true,
  languageCode)` + `asset.getTranscriptText()` (also confirmed field names: `filePath`,
  `length`, not `path`/`duration` — a review pass from one of the two second-opinion
  agents guessed the wrong field names here without checking the installed package;
  verified against `node_modules/videodb/dist/**/*.d.ts` before trusting it).
- **Transcript chunking is character-based, not word-based.** The first version chunked by
  splitting on whitespace (~40 "words" per segment) — both zcode and (independently)
  the general review process caught that this breaks for Thai, which doesn't delimit
  words with spaces: a Thai transcript would come back as one giant unsplit token, one
  segment, degenerate timestamps. Fixed to chunk by character count (~200 chars),
  preferring to break at a nearby space when one exists (harmless for Thai, keeps
  space-delimited languages readable). See `chunkTranscriptText` in `import.service.ts`.
  Segment timestamps are still an approximation (proportional character offset over total
  duration, not real per-word timing) — acceptable for the transcript view and for feeding
  the summary generator, not frame-accurate.
- Resulting segments insert into the existing `transcriptSegments` table under a new
  `recordings` row (all under channel `'them'` - no speaker diarization on a plain batch
  transcript, a known limitation). Once segments exist, **`SummaryGeneratorService.
  generate(recordingId)` runs completely unmodified**.
- **Transcript availability is decoupled from summary success.** The recording is marked
  `status: 'available'` as soon as segments are persisted, before attempting the summary;
  a summary failure only sets `insightsStatus: 'failed'` without discarding the
  already-successful (and already-paid-for, on VideoDB's side) transcript. `insightsStatus`
  exists precisely for this — a caught gap from review, since `SummaryGeneratorService`
  effectively never throws in practice but the decoupling is correct defensively regardless.
- Stuck-`'processing'` recovery on app crash/quit needs no new code: `recordings.
  cleanupStale` (already existed, already wired into `HistoryView`'s mount effect) marks
  any recording stuck in `'processing'` with no `shortOverview` as `'failed'` after 60
  minutes, regardless of source. Added one exclusion so it doesn't waste a network call
  attempting VideoDB capture-session recovery for imports specifically (they never had one).
- DB: `recordings.source` enum (`'live' | 'imported'`, default `'live'`),
  `recordings.importedFileName` (nullable). History list shows an "Imported" tag next to
  the status badge; the Copy-path/Open-folder buttons are disabled for imported recordings
  (they'd point at a `~/.call_md/...` capture folder that was never created for an import).
- File paths are logged as `path.basename(...)` only, not the full path, in every log call
  on this path — both review agents flagged full-path logging as an avoidable info leak
  into log files.
- **Known gaps to accept for v1** (not blockers, just not solved yet): no dedup check if the
  same file gets imported twice, no cleanup of the uploaded VideoDB asset if summary
  generation fails, no guard against the recording being deleted while the pipeline is
  still running. Revisit only if these actually bite in practice.

---

## Feature 3: Second-Opinion AI Summary via zcode + agy — IMPLEMENTED 2026-09-05

**Goal**: on-demand button that runs the meeting transcript through zcode (GLM) and agy
(Gemini/Sonnet) in parallel, producing supplementary summaries alongside the existing
OpenAI-generated one.

**Decision**: shell out to the zcode/agy CLIs directly (not a switch to raw GLM/Gemini API
calls) — reuses มอส's already-authenticated CLI sessions, no new API keys to manage. This
does mean the feature only works on มอส's own machine, which is fine for a solo fork.

### Architecture (as actually built)

- "Get second opinion" button in the recording detail view (`RecordingDetailPage.tsx`,
  below Action Items). On-demand only, not auto-triggered. Clicking it fires both providers
  independently (`generateSecondOpinion` called twice, not awaited sequentially) - each
  card updates as its own IPC call resolves, no blocking on the slower one.
- `second_opinion_summaries` table: `id`, `recordingId`, `provider` (`'zcode' | 'agy'`),
  `content`, `status` (`'ready' | 'failed'` - no `'pending'`: a row is only ever inserted
  once a generation attempt reaches a terminal outcome, so the schema doesn't carry a state
  nothing ever writes), `error`, `generatedAt`. Queried ordered by `id`, not `generatedAt` -
  the latter has 1-second resolution and two rows from a fast regenerate could tie.
- **zcode is a Node script, run via Electron's own bundled Node** rather than any `node` on
  the user's PATH: `spawn(process.execPath, [ZCODE_CJS_PATH, ...], { env: { ...,
  ELECTRON_RUN_AS_NODE: '1' } })`. This sidesteps the whole "which node, which nvm version"
  problem a GUI-launched app would otherwise have. **Verified working** by manually running
  this exact invocation against the real `zcode.cjs` and a test transcript before trusting
  it - agy (a standalone binary, no Node needed) verified the same way.
- Transcript goes into a **temp file** (`os.tmpdir()/call-md-second-opinion-<uuid>/
  transcript.txt`, mode `0700`), referenced by path in a short prompt - never as a
  multi-KB argv string (leaks into `ps` output, risks `ARG_MAX`). zcode gets it via
  `--cwd <tempDir>`, agy via `--add-dir <tempDir>` - both are agentic CLIs with their own
  file-read capability, so they read the file themselves once told its path.
- `spawn(..., { detached: true })` + kill the whole process group on timeout
  (`process.kill(-child.pid, 'SIGKILL')`, falling back to `child.kill()` if `pid` is
  unavailable) - both zcode and agy are agent loops that can spawn their own subprocesses;
  killing only the direct child would orphan those. 3-minute timeout, 1MB combined
  stdout+stderr cap.
- stdout/stderr are accumulated as `Buffer[]` and decoded once at process close
  (`Buffer.concat(...).toString('utf-8')`), not per-chunk - a multi-byte UTF-8 character
  (Thai summaries included, given Feature 1/2) can split across a chunk boundary and get
  mangled if decoded incrementally.
- **In-flight request coalescing**: a module-level `Map<"<recordingId>:<provider>",
  Promise>` in `second-opinion.service.ts` means a duplicate call for the same
  recording+provider while one is already running returns the same in-flight promise
  instead of spawning a second CLI process - catches both a fast double-click and
  navigating away and back while a 3-minute run is still in progress.
- `<SecondOpinionSection key={recordingId} .../>` - keyed by recordingId so switching
  recordings remounts the component cleanly. Without this, a review pass (both zcode and
  agy independently) caught that navigating to a different recording while a generation was
  in flight, or right after, could bleed the previous recording's result (or a late-arriving
  `.then`) into the new recording's displayed state.

Reviewed twice against the actual diff (design-stage, then diff-stage after implementation)
by zcode and agy. Diff-stage review caught all of the above real issues; agy's second
diff-stage review (after being told to only assert against the attached diff, following an
unrelated incident earlier in the session where it guessed wrong SDK field names) was
accurate and matched zcode's findings closely.

---

## Database Plan (Drizzle migrations)

1. `transcriptSegments` — add nullable `translatedText: text`
2. `recordings` — add `source: text({enum:['live','imported']}).notNull().default('live')`
3. `recordings` — add `importedFileName: text` (nullable)
4. New table `secondOpinionSummaries`:
   - `id` (integer, autoincrement, PK)
   - `recordingId` (integer, FK → recordings.id)
   - `provider` (text, enum `'zcode' | 'agy'`)
   - `content` (text)
   - `generatedAt` (text, default now)

**Known tradeoff**: these are fork-only schema changes with no upstream PR planned. If
มอส ever wants to pull `upstream/main` updates into the fork later, `schema.ts` and the
`drizzle/` migration folder are the most likely conflict points. Acceptable for a
personal-use fork; just don't forget it's there if a future `git merge upstream/main`
happens.

---

## UI/UX sketch (lightweight, no formal mockup — solo internal tool)

- **TranscriptionPanel**: each segment bubble becomes two lines — English (appears
  immediately, as today) / Thai (fades in grey→normal once translation arrives, ~1–3s
  behind).
- **Settings → Transcription**: new toggle, "Live Thai translation (beta)".
- **History tab**: new "Import" button (top-right, next to existing controls) → native
  file picker (Main-process dialog, per Feature 2) → new row appears immediately with a
  status badge that progresses `Importing… → Transcribing… → Ready`; a small tag/icon
  distinguishes imported recordings from live ones in the list.
- **Post-meeting Summary view**: existing primary summary card is unchanged. Below it, a
  "Get second opinion" button. On click, two more cards appear — "zcode (GLM)" and
  "agy (Gemini/Sonnet)" — each populating independently as its result lands, not gated on
  both finishing.

## Explicitly deferred (not in v1, discussed and declined)

- Auto-sync of new Google Meet recordings from Drive (declined in favor of manual import)
- In-app playback of imported video files (declined — transcript+summary is enough)
- Direct GLM/Gemini API calls instead of CLI shell-out for Feature 3 (declined — CLI reuse
  preferred over managing new API keys)

---

## Feature 4: Thai Translation of the Final Meeting Summary — IMPLEMENTED 2026-09-05

**Origin**: after using Features 1-3 live, asked Ayami + zcode + agy for a fresh round of
"what's next" suggestions. All three independently ranked this at or near the top: the live
per-segment overlay (Feature 1) translates the *live view*, but the *saved* summary
(shortOverview/keyPoints/postMeetingChecklist) stayed English even with the toggle on —
an inconsistent, unfinished-feeling gap given what had just been built.

**Goal**: once a summary is generated (live-call-end or import), also translate it to Thai
if the same `translationEnabled` setting is on — no second toggle.

### Architecture

- New `src/main/services/copilot/summary-translation.service.ts`. Three independent
  translation calls (overview paragraph, keyPoints JSON, checklist JSON array) via the
  existing `getLLMService()` — no new credentials.
- **Skips translation entirely if the summary is already predominantly Thai** — checked via
  a Thai-Unicode-block character-density heuristic (`>30%` of non-whitespace chars).
  Relevant because an imported Thai-language recording (Feature 2) already gets a Thai
  summary directly from the existing generator; translating Thai to Thai would be wasted
  LLM calls. Verified against the real Huawei-meeting import from Feature 2's live test.
- **Each of the three sections translates and validates independently.** A section that
  fails - LLM error, unparseable JSON, or output that doesn't match the expected shape/
  length - resolves to `null` for that section only, never a thrown error and never a
  silent English-text fallback disguised as a translation. Both zcode and agy's diff-stage
  review independently caught two things about the first draft, now fixed:
  1. The translated `keyPoints`/`checklist` JSON was only checked with `Array.isArray()`,
     not validated against the expected shape or length - an LLM deviating from the
     requested structure would have reached the renderer's `.map()` calls and could have
     crashed the whole detail page. Now validated with `isValidKeyPoints`/
     `isValidStringArray` (shape *and* length) before being trusted.
  2. On failure, the original draft returned the *English* text as the "Thai" result,
     which would render as English dressed up as a translation. Now returns `null` per
     section instead, and the renderer's existing `if (x)` guards already skip rendering
     absent sections correctly.
- Wired into both places a summary is generated: `sales-copilot.service.ts`'s `endCall()`
  (live calls) and `import.service.ts`'s `processImportedRecording()` (imports). Both call
  sites wrap the translation call in its own try/catch, separate from the summary-
  generation try/catch - a translation failure must never be able to mark an
  already-successful English summary as failed (the function's own contract is "never
  throws", but this is a deliberate belt-and-suspenders guard against that contract ever
  being violated by a future change).
- New nullable columns `shortOverviewTh`, `keyPointsTh`, `postMeetingChecklistTh` on
  `recordings` (same `addColumnIfMissing` migration pattern as the rest of this fork).
- Renderer: `SummaryCard`, `KeyPointsCard`, `ActionItemsCard` in `RecordingDetailPage.tsx`
  each render the Thai version stacked below the English (separated by a thin divider),
  matching the visual pattern the live overlay (Feature 1) already established.
  `ActionItemsCard` aligns `checklistTh[idx]` with `checklist[idx]` by position - safe
  specifically because `translateChecklist` now enforces equal length before returning.
- Settings copy for the toggle (`TranscriptionPanel.tsx`) updated from "Live Thai
  Translation" to "Thai Translation" and its description broadened to mention both the
  live overlay and the final summary, since the setting now covers both.

### Known tradeoff

Live-call-end now blocks on 3 additional parallel LLM calls before the recording is marked
processed, adding a few seconds to perceived "call ended" latency when the toggle is on.
Accepted as proportionate - the primary summary generation already does the same thing
(3 parallel LLM calls) for the English version.

---

## Feature 5: Full-Text Search Over Recording History — IMPLEMENTED 2026-09-05

**Origin**: same "what's next" round as Feature 4 - Ayami, zcode, and agy all flagged that
the History search box only matched `meetingName`/`shortOverview` substrings client-side,
which would feel increasingly broken as the recording count grew from both live use and
the new Import feature.

**Goal**: search meeting name, summary (English + Thai), key points, action items, and the
full transcript - not just the title/overview.

### Architecture

- A raw SQLite FTS5 virtual table `recordings_fts` (not part of the Drizzle schema - Drizzle
  has no first-class FTS5 support), tokenized with **`trigram`, not the default `unicode61`
  word-tokenizer** - the deciding factor for this whole design. Most of this fork's actual
  content is Thai (Features 1/2/4), and Thai has no spaces between words; a word-tokenizer
  would index an entire Thai paragraph as one unsearchable token. Trigram indexes every
  3-character window instead, giving substring search that works identically for English,
  Thai, or mixed text with no word-segmentation step. Verified directly (via Electron's own
  bundled Node, since better-sqlite3's native binary is ABI-specific to Electron and
  segfaults under plain system `node`) that trigram correctly substring-matches both
  scripts, is case-insensitive, and fails safe (zero rows, not an error) on 1-2 character
  queries - only a genuinely empty string throws.
- Indexes `meetingName`, `shortOverview`/`shortOverviewTh`, flattened `keyPoints`/
  `keyPointsTh` (topic + points joined), flattened `postMeetingChecklist`/
  `postMeetingChecklistTh`, the full concatenated transcript, and `insights` - a legacy
  field from a pre-Meeting-Co-Pilot version of the app (`InsightsService`, confirmed dead
  code, never instantiated anywhere in the current codebase) that some older recordings
  still carry and that `RecordingCard` still falls back to displaying.
- **Populated by full delete+insert** (FTS5 has no native UPSERT), wrapped in one
  `sqlite.transaction()`, whenever a summary is generated - both the live-call-end path
  (`sales-copilot.service.ts`) and the import path (`import.service.ts`), reusing the same
  hook points Feature 4 already added. The import path re-indexes even if summary
  generation itself failed, since the transcript was already persisted and is searchable
  on its own.
- **One-time startup backfill** (`backfillSearchIndex`) indexes any recording that predates
  this feature, comparing against what's already in `recordings_fts` and skipping the rest -
  cheap at personal scale, and self-healing (a recording that fails to index one run is
  simply not yet in the table, so the next startup retries it).
- **`buildFtsQuery`**: each whitespace-separated word becomes its own quoted phrase (safe
  against FTS5 operator injection - `AND`/`OR`/`NOT`/`:` embedded in user input lose all
  operator meaning inside a quoted phrase), ANDed together so a multi-word search requires
  every word to appear somewhere in the document, in any order. **Words under 3 characters
  are dropped, not included** - both zcode and agy's diff-stage review independently caught
  that a short word inside an ANDed query is worse than useless: trigram can never match
  anything shorter than 3 characters, so ANDing an unmatchable phrase into the query zeroed
  out the *entire* search even when the other word(s) genuinely matched. Verified concretely:
  with "AI" present in indexed text, `"launching" AND "AI"` returned zero rows even though
  `"launching"` alone matched; dropping "AI" instead makes `launching AI` correctly search
  for just "launching".
- Renderer (`HistoryView.tsx`): 300ms debounce, only queries at 3+ characters (below that,
  trigram can't meaningfully match, so the unfiltered list shows instead).
  `placeholderData: keepPreviousData` (react-query v5) keeps showing the previous search's
  matches while a new query is in flight, rather than flashing to the full unfiltered list
  on every keystroke - both reviewers caught this as a minor but real flicker in the first
  draft.
- Not ordered by FTS5's relevance `rank`: the renderer re-sorts matches by recording date for
  a "history" browsing feel, so computing a rank would be wasted work - removed from the
  query for that reason.

### Known tradeoffs (accepted for v1)

- No recording-delete path exists anywhere in this codebase currently (confirmed by search),
  so there's nothing to wire an FTS cleanup into yet. If a delete feature is ever added, it
  needs `DELETE FROM recordings_fts WHERE recordingId = ?` alongside it, or search will
  surface ghost results for deleted recordings (harmless today only because the renderer
  filters search matches against the live recordings list before rendering).
- The FTS index isn't updated if a recording's searchable fields are edited by some future
  path other than the two summary-generation call sites - there's no rename/edit feature
  today, so this is speculative, not a known gap.
