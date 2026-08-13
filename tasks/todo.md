# Open issues — implementation plan

Branch: `fix/security-hardening-and-issues`

Covers the three open issues on `video-db/call.md`:

- [#27](https://github.com/video-db/call.md/issues/27) — Security & Privacy Audit
- [#25](https://github.com/video-db/call.md/issues/25) — Non-English real-time transcription
- [#29](https://github.com/video-db/call.md/issues/29) — Where is the Windows installer?

---

## Findings (verified before writing code)

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Plaintext credentials in app data JSON | **True** | `src/main/lib/config.ts` writes `config.json` with `apiKey` + `accessToken` via plain `fs.writeFileSync` |
| Plaintext credentials in SQLite `users` | **True** | `users.api_key` / `users.access_token` stored raw (`src/main/db/schema.ts:6`) |
| MCP env vars stored unencrypted | **False (already fixed)** | `connection-orchestrator.service.ts` calls `encryptCredentials()`; `mcp-client.service.ts` decrypts |
| MCP OAuth tokens unencrypted | **False (already fixed)** | `mcp-auth.service.ts` encrypts before `upsertMCPOauthToken` |
| ...but the AES key itself is plaintext on disk | **True** | `src/main/utils/encryption.ts:31` writes the raw key next to the data it protects |
| CORS accepts all origins | **True** | `src/main/server/index.ts:20` `origin: '*'` |
| API server reachable off-box | **True (not in report)** | `serve({fetch, port})` with no `hostname` → Node binds `0.0.0.0`/`::` |
| Webhook URLs unvalidated (SSRF) | **True** | `workflow-webhook.service.ts` `fetch(webhookUrl)` with zero validation |
| Electron sandbox disabled | **True** | `sandbox: false` in `src/main/index.ts:144` and `widget.window.ts:92`; both preloads only use `contextBridge`/`ipcRenderer`, so sandbox is safe to enable |
| SQLite world-readable | **True** | `new Database(dbPath)` → mode 0644 |
| Logs may contain secrets | **True** | no pino `redact` config |
| Renderer persists API key to localStorage | **True (not in report)** | `config.store.ts` `partialize` includes `apiKey` |

**#25** — `startTranscript()` in the JS SDK (checked 0.2.5 *and* 0.3.0) sends only
`{action, engine, ws_connection_id}`. There has never been a `language_code` param, so
patching `rtstream.js` could not have worked. The app must send `language_code` itself.

**#29** — There is no Windows installer. `@videodb/recorder@0.2.4` ships binaries for
`darwin-x64` and `darwin-arm64` only (`binaryConfig.checksums`), and every `.exe` path on
`artifacts.videodb.io/call.md/` returns 403 while the `.dmg` returns 200. The README's
"available for macOS and Windows" is inaccurate.

---

## Tasks

### Issue #27 — Security hardening
- [x] Bind the local HTTP server to `127.0.0.1` instead of all interfaces
- [x] Restrict CORS to loopback origins; drop the wildcard
- [x] Store `config.json` secrets with Electron `safeStorage` (OS keychain), with transparent migration of existing plaintext configs
- [x] Encrypt `users.api_key` at rest; store `users.access_token` as a SHA-256 hash
- [x] Wrap the AES key file with `safeStorage` so it is no longer plaintext-next-to-data
- [x] Validate webhook URLs (block non-HTTP(S), loopback, private/link-local/CGNAT ranges, cloud metadata IPs) at create, update, test and call time
- [x] Enable the Electron `sandbox` on both windows
- [x] Restrict file permissions: userData `0700`, SQLite DB + config + logs `0600`
- [x] Redact secrets from logs via pino `redact`
- [x] Stop persisting the API key in renderer localStorage

### Issue #25 — Non-English transcription
- [x] Add `transcriptionLanguage` to `AppConfig` + a language list shared with the renderer
- [x] Send `language_code` to `POST /rtstream/{id}/transcription` (the SDK omits the field)
- [x] Fall back to the SDK call when the language is `auto`
- [x] Add a **Transcription** settings tab with a language picker
- [x] Document the remaining server-side dependency

### Issue #29 — Windows installer
- [x] Replace the inaccurate platform claim in the README with a verified support table
- [x] Add build-from-source instructions + `dist:win` / `dist:linux` scripts
- [x] Fail with a clear message (not a cryptic crash) when recording on an unsupported OS

### Verification
- [x] `npm run typecheck` — no new errors (2 pre-existing failures in
      `LiveAssistPanel.tsx` are unchanged from `main`)
- [x] `npm test` — 23 unit tests
- [x] App launches, migrates and serves on an isolated `--user-data-dir`
- [ ] `npm run lint` — **cannot run**: the `lint` script calls `eslint`, which is
      not a dependency of this repo (pre-existing, unrelated to this branch)

---

## Review

### What changed

**#27 — security hardening**

| Fix | Where |
| --- | --- |
| Server binds `127.0.0.1` (was all interfaces) | `src/main/server/index.ts` |
| CORS restricted to loopback origins (was `*`) | `src/main/server/index.ts` |
| `config.json` secrets encrypted via OS keyring, migrated on read | `src/main/lib/config.ts`, `src/main/lib/secure-store.ts` |
| `users.api_key` encrypted, `users.access_token` hashed, both migrated on startup | `src/main/db/index.ts` |
| AES key file wrapped by the keyring instead of sitting in plaintext | `src/main/utils/encryption.ts` |
| Webhook URLs validated (scheme, credentials, DNS, private ranges, redirects) | `src/main/lib/url-guard.ts`, `ipc/workflows.ts`, `workflow-webhook.service.ts` |
| Chromium sandbox enabled on all three windows | `src/main/index.ts`, `windows/widget.window.ts`, `ipc/app.ts` |
| userData `0700`; DB, config, tokens, logs `0600` | `src/main/lib/config.ts`, `db/index.ts`, `lib/logger.ts` |
| Credential-shaped fields redacted from logs | `src/main/lib/logger.ts` |
| API key no longer written to renderer localStorage | `src/renderer/stores/config.store.ts` |

Two report items needed no code: MCP env vars and MCP OAuth tokens were already
encrypted. What was wrong there is that the *key* was plaintext on disk — fixed
above.

**#25 — non-English transcription.** The app now sends `language_code` on
`POST /rtstream/{id}/transcription`. It could not do this through the SDK:
`RTStream.startTranscript()` posts `{action, engine, ws_connection_id}` and has
no language parameter in any published version, which is why the reporter's
`rtstream.js` patch had no effect. `rtstream-transcript.service.ts` makes the
request directly when a language is set and falls back to the SDK call
otherwise, so an unsupported language degrades to the engine default instead of
killing the transcript. Settings → Transcription picks the language.

**#29 — Windows installer.** There is none, and the README claimed otherwise.
`@videodb/recorder@0.2.4` publishes `darwin-x64` and `darwin-arm64` binaries
only, and every `.exe` path under `artifacts.videodb.io/call.md/` 403s while the
`.dmg` 200s. Replaced the claim with a verified support table, documented
building on Windows/Linux, added `dist:win` / `dist:linux`, and made
`recorder-start-recording` return a clear message on unsupported platforms
instead of failing inside the native layer.

### Evidence

Run against a build on an isolated `--user-data-dir` (the machine's real
Call.md data was left untouched):

```
listening socket   TCP 127.0.0.1:51799 (LISTEN)     # unpatched build: TCP *:51731
GET loopback       200
GET LAN IP         connection refused
Origin: evil.com   no Access-Control-Allow-Origin
Origin: localhost  access-control-allow-origin: http://localhost:51730
recordings.list    401 UNAUTHORIZED without a token
userData / db      drwx------ / -rw-------          # unpatched build: -rw-r--r--
```

22 integration assertions inside a real Electron process cover the upgrade path:
a pre-existing user with a plaintext key and token still resolves after
migration, new credentials never appear in the DB file, and a legacy plaintext
`config.json` is rewritten encrypted on first read.

### Deliberate limits

- **`language_code` still depends on the backend.** The client-side gap is
  closed, but the reporter also observed the parameter not reaching AssemblyAI.
  That is server-side and outside this repo; the UI says so rather than
  implying a language will definitely work.
- **Windows recording is not enabled.** It cannot be from this repo — it needs
  a Windows build of the capture engine in `@videodb/recorder`.
- **`auth_config.json` is still plaintext.** It is a bootstrap file that the app
  deletes immediately after use; encrypting it would break the external tooling
  that writes it.
- **Recording metadata is not encrypted at rest.** Report item #5. Encrypting
  transcripts in SQLite would break search and every existing query; the file is
  now `0600` inside a `0700` directory, which is the meaningful part of that
  finding. Full-database encryption (SQLCipher) is a separate piece of work.
