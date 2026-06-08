# Requirements — Capsule Memory Engine

## Overview
The Capsule Memory Engine is the core feature of Synapse AI Link. It captures AI conversation context into structured, portable memory objects called "capsules" and enables recall across any supported LLM platform.

---

## Requirements

### 1 — Capsule Generation via Groq AI

**User Story:** As a user working on a project in any LLM, I want to save my conversation as a structured memory capsule so that I can continue from the same context on any other AI platform.

**Acceptance Criteria:**

- 1.1 — The Synapse button (◉) is injected into the input toolbar of ChatGPT, Claude, Gemini, and Perplexity
- 1.2 — Clicking the button opens a popover with an auto-detected project title field
- 1.3 — Clicking Generate scrapes the current conversation DOM using platform-specific selectors
- 1.4 — Extracted messages are deduplicated by first-50-character key before processing
- 1.5 — The system calls Groq API (`llama-3.1-8b-instant`) with conversation turns and returns a structured JSON capsule
- 1.6 — The capsule contains all 6 layers: `layer1_identity`, `layer2_architecture`, `layer3_state`, `layer4_facts`, `document_summary`, `user_preferences`
- 1.7 — If Groq API fails, `generateCapsuleLocally()` produces a valid heuristic fallback capsule without any network call
- 1.8 — A loading animation cycles through 5 status messages during generation at 2-second intervals
- 1.9 — The capsule key follows the format `@CAP-PROJECTNAME` (uppercase slug)
- 1.10 — Project names are validated via `validateProjectName()` — minimum 4 chars, no forbidden status words

### 2 — Capsule Storage (Local + Cloud)

**User Story:** As a user, I want my capsules saved both locally and in the cloud so they are available instantly on the current device and accessible from other devices.

**Acceptance Criteria:**

- 2.1 — Capsule is saved to `capsules/{capsuleId}` flat Firestore collection with `owner_uid`
- 2.2 — Capsule is saved to `users/{uid}/projects/{projectId}/capsules/{capsuleId}` subcollection
- 2.3 — Semantic memory summary at `memory/{uid}` is updated with `arrayUnion` for topics and concepts, and `increment(1)` for `sessionCount`
- 2.4 — Project state written to `users/{uid}/projects/{pid}/state/current`
- 2.5 — Facts written individually to `users/{uid}/projects/{pid}/facts/{factId}` with type and importance
- 2.6 — User decisions written to `users/{uid}/projects/{pid}/decisions/{decisionId}`
- 2.7 — Capsule is also available in `chrome.storage.local` under the `capsules` key for fast local reads
- 2.8 — Anonymous users (`owner_uid: "anonymous"`) can save capsules to the flat collection only

### 3 — Capsule Injection via @CAP Syntax

**User Story:** As a user on any LLM platform, I want to type `@CAP-MYPROJECT` and press Enter to instantly inject my full project context into the conversation.

**Acceptance Criteria:**

- 3.1 — A `keydown` listener detects Enter key with `@CAP-` pattern in the active input
- 3.2 — `chrome.storage.local` is checked first for the capsule; Firestore queried only if not found locally
- 3.3 — A full memory prompt is reconstructed from capsule fields before injection
- 3.4 — ChatGPT injection uses React synthetic value setter via `Object.getOwnPropertyDescriptor`
- 3.5 — Claude injection uses `document.execCommand('insertText')` on the ProseMirror contenteditable
- 3.6 — Gemini injection uses `ClipboardEvent` with `text/plain` data to trigger paste
- 3.7 — Perplexity injection uses direct `textarea.value` setter with `input` event dispatch
- 3.8 — After injection, the platform's send button is programmatically clicked to submit
- 3.9 — If capsule is not found in local storage or Firestore, a clear error is shown to the user

### 4 — Background Fact Scanner

**User Story:** As a user, I want the extension to automatically extract and categorize important facts from my ongoing conversation so that my capsule memory stays up to date without manual effort.

**Acceptance Criteria:**

- 4.1 — The fact scanner runs every 30 seconds via `setInterval`
- 4.2 — Facts are categorized into 6 types: `hardware_configuration`, `code_detail`, `system_configuration`, `user_decision`, `system_state`, `study_fact`
- 4.3 — Facts are deduplicated against previously stored facts before saving
- 4.4 — Facts are stored in `chrome.storage.local` keyed by `window.location.href` (conversation URL)
- 4.5 — The scanner handles historical backfill on first page load
- 4.6 — The scanner does not run if the user is not authenticated

### 5 — Smart Title Generation

**User Story:** As a user, I want the capsule title to be automatically suggested so that I don't have to type it manually.

**Acceptance Criteria:**

- 5.1 — `generateSmartTitle()` first checks the browser tab title, stripping platform names (ChatGPT, Claude, Gemini, Perplexity)
- 5.2 — If the page title is invalid, the first user message is scanned for noun phrases after action verbs (building, creating, developing, working on)
- 5.3 — If no valid title is found, an empty string is returned and the user must type manually
- 5.4 — All title candidates are validated with `validateProjectName()` before use
