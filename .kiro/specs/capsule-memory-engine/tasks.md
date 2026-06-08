# Tasks — Capsule Memory Engine

## Implementation Status

All tasks in this spec are **COMPLETED** as of v1.0.

---

## Task List

- [x] **Task 1** — Implement `extractRecentMessages()` with 4-platform DOM scrapers
  - [x] ChatGPT: 4-layer fallback selector chain (`[data-message-author-role]` → `article[data-testid]` → `.group/conversation-turn` → generic class)
  - [x] Claude: `[data-testid="human-turn"]` + `[data-testid="ai-turn"]` with class fallback
  - [x] Gemini: `user-query`, `model-response`, `[data-turn-role]` with class fallback
  - [x] Perplexity: generic `[class*="message"]` fallback
  - [x] Deduplication by first-50-character key

- [x] **Task 2** — Implement `getCleanText()` attachment handler
  - [x] Convert file attachment cards to `[Attached File: filename]` text nodes
  - [x] Strip UI elements: buttons, SVGs, images, scripts, feedback elements

- [x] **Task 3** — Implement `generateSmartTitle()` with validation
  - [x] Page title extraction with platform name stripping
  - [x] First user message noun phrase extraction
  - [x] `validateProjectName()` with forbidden word list
  - [x] `validateProjectPurpose()` with minimum length and word count checks

- [x] **Task 4** — Implement Groq API capsule generation
  - [x] POST to `https://api.groq.com/openai/v1/chat/completions`
  - [x] Model: `llama-3.1-8b-instant`, temperature: 0.2, max_tokens: 800
  - [x] JSON response parsing with markdown fence stripping
  - [x] `promiseWithTimeout()` wrapper to prevent hanging requests

- [x] **Task 5** — Implement `generateCapsuleLocally()` fallback
  - [x] Heuristic extraction from message array
  - [x] Produces valid capsule JSON without network call

- [x] **Task 6** — Implement `PlatformAdapters` for all 4 LLMs
  - [x] ChatGPT: React synthetic value setter
  - [x] Claude: ProseMirror `execCommand`
  - [x] Gemini: ClipboardEvent paste
  - [x] Perplexity: native textarea value setter

- [x] **Task 7** — Implement Synapse button injection
  - [x] `findTargetContainer()` per platform
  - [x] `checkAndInjectButton()` with auth gate
  - [x] `storage.onChanged` listener to show/hide button on auth state change
  - [x] Injected CSS scoped to `.synapse-` prefix with `!important`

- [x] **Task 8** — Implement popover UI
  - [x] Title input field with auto-populated value
  - [x] Generate button with loading animation
  - [x] Capsule library list with drag-to-inject capability

- [x] **Task 9** — Implement Memory Inspector modal
  - [x] 800×600 tabbed modal overlay
  - [x] Tabs: Overview, Facts, Decisions, State, Documents
  - [x] Fact priority badge system (p1=teal, p2=blue, p3=grey)
  - [x] Add/delete fact and decision rows

- [x] **Task 10** — Implement `saveCapsule` message handler in background.js
  - [x] `getCurrentUserAsync()` with 1s timeout fallback
  - [x] Flat collection write: `capsules/{capsuleId}`
  - [x] Semantic memory write: `memory/{uid}` with merge
  - [x] Project document write with `createdAt` preservation
  - [x] Facts subcollection: priority → importance mapping
  - [x] Decisions subcollection
  - [x] State subcollection: `state/current`
  - [x] Documents subcollection from `synapse_vault` + `synapse_intercepted`
  - [x] Images subcollection (isImage detection)

- [x] **Task 11** — Implement `resolveCapsule` handler in background.js
  - [x] Query `capsules` where `key == key`
  - [x] Return first matching document

- [x] **Task 12** — Implement `@CAP-*` injection on Enter keydown
  - [x] Regex detection of `@CAP-` pattern
  - [x] Local storage lookup first
  - [x] Background message fallback to Firestore
  - [x] Memory prompt reconstruction
  - [x] Platform adapter injection + submit

- [x] **Task 13** — Implement background fact scanner
  - [x] `setInterval` at 30,000ms
  - [x] 6-category regex classification
  - [x] Deduplication against stored facts
  - [x] Per-URL local storage keying
  - [x] Historical backfill on first load

- [x] **Task 14** — Implement loading animation system
  - [x] `showLoadingAnimation(elementId)` — 5-message cycle at 2s intervals
  - [x] `stopLoadingAnimation(intervalId, elementId, finalMessage)`

---

## V1.1 Pending Tasks

- [ ] **Task 15** — Replace sequential Firestore writes with `writeBatch()`
  - Affects: `background.js` → `saveCapsule` handler
  - Impact: Reduces save latency from ~10 sequential round-trips to 1 batch commit

- [ ] **Task 16** — Add dedicated Perplexity DOM extractor
  - Current: Falls through to generic `[class*="message"]` fallback
  - Needed: Platform-specific selectors matching Perplexity's actual DOM structure

- [ ] **Task 17** — Proxy Groq API key through Firebase Cloud Function
  - Current: `GROQ_API_KEY` hardcoded in `background.js` and `content.js`
  - Needed: Server-side proxy to hide key from extension source
