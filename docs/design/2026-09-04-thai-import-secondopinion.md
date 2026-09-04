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

## Feature 2: Import & Batch-Process Existing Recordings

**Goal**: manually import a video/audio file (e.g. a Google Meet recording already
downloaded from Drive) and get transcript + summary, including Thai (batch transcription
supports Thai even though live streaming doesn't).

**Explicitly out of scope for v1**: no Google Drive API/OAuth integration (user downloads
the file themselves first), no in-app playback of imported video (transcript + summary
only — playback would require a loopback media server or custom protocol to satisfy
`webSecurity`, not worth the complexity for v1).

### Architecture

- **File picker runs entirely in the Main process** (`dialog.showOpenDialog`), never accepts
  a renderer-supplied path. This is the one hard security requirement both reviewers flagged
  — a sandboxed renderer that could pass arbitrary local paths to an upload-to-cloud call is
  a real exfiltration surface if the renderer were ever compromised. tRPC procedure
  `import.selectAndUploadFile` — renderer just says "user clicked Import," gets back a
  `recordingId` + status.
- **Async job pattern, not a blocking request.** VideoDB upload + AssemblyAI batch transcribe
  on a 1–2hr file can take minutes — holding an HTTP/tRPC request open that long risks
  timeouts. `import.selectAndUploadFile` returns immediately with
  `{ recordingId, status: 'processing' }`; main process emits IPC progress events
  (`import:progress`, `import:completed`) as the job advances.
- VideoDB Node SDK (`videodb` npm package, already used in `videodb.service.ts`) exposes
  `coll.uploadFile({ file_path })` for arbitrary local files — unused today, greenfield
  addition. After upload, request transcript with `language_code: 'th'` (or whatever the
  user picks — batch transcription's language support is broader than streaming's).
- Resulting segments insert into the existing `transcriptSegments` table under a new
  `recordings` row. Once segments exist, **`SummaryGeneratorService.generate(recordingId)`
  runs completely unmodified** — it only needs a `recordingId`, doesn't care if the
  recording was live or imported.
- DB: `recordings.source` enum (`'live' | 'imported'`, default `'live'`),
  `recordings.importedFileName` (nullable) for history-list display.
- **Known gaps to accept for v1** (not blockers, just not solved yet): no dedup check if the
  same file gets imported twice, no file-size/duration limit, no cleanup of a partial upload
  if the job fails mid-way. Revisit only if these actually bite in practice.

---

## Feature 3: Second-Opinion AI Summary via zcode + agy

**Goal**: on-demand button that runs the meeting transcript through zcode (GLM) and agy
(Gemini/Sonnet) in parallel, producing supplementary summaries alongside the existing
OpenAI-generated one.

**Decision**: shell out to the zcode/agy CLIs directly (not a switch to raw GLM/Gemini API
calls) — reuses มอส's already-authenticated CLI sessions, no new API keys to manage. This
does mean the feature only works on มอส's own machine, which is fine for a solo fork.

### Architecture

- On-demand only — a "Get second opinion" button in the post-meeting summary view. NOT
  auto-triggered per meeting (CLI calls run 15s–180s+ and cost tokens; don't want that on
  every meeting by default).
- New `secondOpinionSummaries` table: `id`, `recordingId`, `provider` (`'zcode' | 'agy'`),
  `content` (text), `generatedAt`. Kept separate from the existing single
  `shortOverview`/`keyPoints` columns on `recordings` — those stay the "primary" summary;
  this is explicitly supplementary.
- **Security fixes required vs. the naive approach** (both reviewers flagged the same
  issues independently):
  - Use `child_process.execFile`/`spawn` with an **explicit argument array**, never shell
    string interpolation (`exec`) — a transcript containing quotes/backticks/`$` is
    attacker-controlled-shaped input even though it's just meeting text; don't give it a
    shell to inject into.
  - **Pass the transcript via stdin or a temp file, not argv** — multi-KB transcripts as
    command-line arguments leak into `ps` output and can hit `ARG_MAX`.
  - **Hardcode absolute paths**, do not rely on `$PATH` — a GUI Electron app launched from
    Finder/Dock does not inherit the shell's `.zshrc`/`.bash_profile`, so `zcode`/`agy`
    resolved via shell alias or bare `PATH` lookup will fail with `ENOENT`. Use
    `node /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` and the resolved full
    path to the `agy` binary (`~/.local/bin/agy` expanded, not relied on via `PATH`).
  - `agy --mode plan` and `zcode --disallowedTools "Edit Write"` are the right defaults
    already in the draft — keep them, but they are not a hard sandbox; do not treat them as
    a security boundary, only as "avoid accidental file writes."
  - **3-minute timeout + explicit process kill** on timeout, app quit, or user cancellation
    — an orphaned agent-loop subprocess is a real risk otherwise.
- Render each provider's card as its result arrives, don't wait for both — zcode and agy can
  differ by 10s to 3 minutes in practice; blocking the UI on the slower one is bad UX for no
  reason.

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
