# Design: Thai Translation, Recording Import, Second-Opinion Summary

**Status**: Design approved by มอส, not yet implemented.
**Scope**: Personal fork (mozzquito/call.md), solo use, not intended for upstream PR.
**Design reviewed by**: zcode (GLM) and agy (Gemini), 2026-09-04.

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
