---
inclusion: always
---

# Architecture Decisions — Synapse AI Link

These are the key architectural decisions that must be respected during all development.

---

## ADR-001: Local SDK Copies Instead of CDN

**Decision:** All Firebase SDK files are stored locally in `libs/firebase/`.

**Reason:** Chrome Extensions have a strict Content Security Policy (CSP) that blocks loading scripts from external URLs like `https://www.gstatic.com`. Using CDN imports would cause the extension to fail entirely.

**Rule:** Never replace local SDK imports with CDN URLs. New SDK updates must be bundled locally.

---

## ADR-002: Local-First Read Strategy

**Decision:** `chrome.storage.local` is always read before querying Firestore.

**Reason:** Capsule injection happens on the critical path (user pressing Enter to submit). Any network latency would create a noticeable UX delay. Local storage resolves in microseconds.

**Rule:** All read operations check local storage first. Firestore is only queried as a fallback or for explicit sync operations.

---

## ADR-003: Dual-Write for Capsules (Flat + Nested)

**Decision:** Every capsule save writes to both `capsules/{id}` (flat collection) AND `users/{uid}/projects/{pid}/capsules/{id}` (project subcollection).

**Reason:** 
- Flat collection enables fast key-based resolution (`resolveCapsule` queries `capsules where key == key`)
- Nested subcollection enables project-scoped queries and rich project memory dashboard
- Backwards compatibility maintained for existing capsule resolution code

**Rule:** Both write paths must always be maintained together. Do not remove either.

---

## ADR-004: Service Worker Auth Timeout

**Decision:** `getCurrentUserAsync()` uses a 1-second `setTimeout` fallback alongside the `onAuthStateChanged` listener.

**Reason:** Chrome MV3 service workers are terminated when idle and cold-start on the next message. Firebase Auth restores from IndexedDB asynchronously after cold start. Without the timeout, `auth.currentUser` would be `null` for all operations during cold start.

**Rule:** Any service worker function that needs the current user must use `getCurrentUserAsync()` — never access `auth.currentUser` directly.

---

## ADR-005: Zero Custom Backend

**Decision:** No server-side code. All backend needs handled by Firebase (Auth + Firestore) and Groq API.

**Reason:** 
- Eliminates deployment complexity
- No server maintenance costs
- Firebase scales automatically
- Groq provides hosted inference with no model deployment

**Rule:** Do not introduce Express, Flask, or any other server framework. If server-side logic is needed, use Firebase Cloud Functions.

---

## ADR-006: Platform-Specific Injection Adapters

**Decision:** Each LLM platform has its own dedicated injection method rather than a generic approach.

**Reason:** Each platform uses a fundamentally different editor technology:
- ChatGPT: React-controlled `<textarea>` with synthetic event system
- Claude: ProseMirror `contenteditable` requiring `execCommand`
- Gemini: Quill/Lexical `contenteditable` requiring clipboard paste simulation
- Perplexity: Native `<textarea>` with standard DOM events

A generic approach would fail on at least 3 of the 4 platforms.

**Rule:** New LLM platforms must get their own adapter entry in `PlatformAdapters`. Do not attempt a one-size-fits-all injection method.

---

## ADR-007: Head+Tail Text Compression

**Decision:** Large documents are compressed by keeping the first 60% and last 40%, joined with `[...compressed...]`.

**Reason:** Document introductions contain context (what the document is about) and conclusions contain results (key findings). Middle sections often contain redundant detail. This heuristic preserves the most AI-useful content within Firestore document size limits.

**Rule:** The `compressTextLocally(raw, maxChars)` function in `popup/popup.js` implements this. Do not replace with simple truncation.

---

## ADR-008: Multi-Layer DOM Selector Fallbacks

**Decision:** Each LLM platform's conversation extractor has 3–4 selector fallbacks tried in priority order.

**Reason:** LLM platforms (especially ChatGPT) change their DOM structure frequently. A single selector would break on every platform update. Fallback chains ensure extraction continues working after minor DOM changes.

**Rule:** When adding or updating selectors, add new selectors as a higher-priority option rather than replacing existing ones. The fallback chain should grow, not shrink.

---

## ADR-009: Capsule Key Format

**Decision:** Capsule recall keys use the format `@CAP-PROJECTNAME` (uppercase slug).

**Reason:** The `@` prefix makes keys visually distinct from normal text. The `CAP-` prefix makes the intent clear. Uppercase slugs are easy to type and remember (`@CAP-FLUTTER`, `@CAP-EMBEDDED-SYSTEM`).

**Rule:** Key generation must produce `@CAP-` + uppercase project name slug. The `@CAP-` prefix is hardcoded in the injection detection regex in `content.js` — do not change the format without updating the regex.

---

## ADR-010: Auth Via Web Portal (Not Inline Popup)

**Decision:** The popup's auth screen shows a single "Sign In on Website" button that opens `welcome.html` as a new tab, rather than embedding an auth form inline.

**Reason:** Google OAuth requires a popup window or redirect. Chrome Extension popups cannot host Google's OAuth popup reliably — the popup closes the extension popup. Delegating auth to a full tab (welcome.html) avoids this entirely.

**Rule:** Do not add inline email/password auth forms back to the popup itself. The `authScreen` in the popup is intentionally minimal.
