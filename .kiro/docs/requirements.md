# Requirements — Synapse AI Link

> All requirements are derived exclusively from analysis of the actual codebase.
> Each requirement traces to a specific file and implementation.

---

## Authentication Requirements

**REQ-001** — Email/Password Registration
> Users must be able to register with a display name, email address, and password.
- Acceptance: `createUserWithEmailAndPassword` completes; `users/{uid}` document created in Firestore with `name`, `email`, `provider: 'email'`, `createdAt`, `lastLogin`.
- Source: `popup/auth.js` → `registerUser()`, `welcome.js`

**REQ-002** — Email/Password Login
> Users must be able to sign in with a registered email and password.
- Acceptance: `signInWithEmailAndPassword` succeeds; Firestore `users/{uid}.lastLogin` updated; `synapse_auth_status: true` written to `chrome.storage.local`.
- Source: `popup/auth.js` → `loginUser()`, `welcome.js`

**REQ-003** — Google OAuth Login
> Users must be able to sign in using a Google account via popup.
- Acceptance: `signInWithPopup(auth, GoogleAuthProvider)` succeeds; `users/{uid}` created or updated in Firestore; auth state synced to extension storage.
- Source: `popup/auth.js` → `loginWithGoogle()`, `welcome.js`, `background.js` → `login` handler

**REQ-004** — Google OAuth Fallback via Service Worker
> If Google sign-in popup is blocked in the extension context, the system must fall back to triggering auth through the background service worker.
- Acceptance: `chrome.runtime.sendMessage({action: "login"})` is called when popup throws; background.js handles via `signInWithPopup`.
- Source: `popup/auth.js` → `loginWithGoogle()` catch block, `background.js`

**REQ-005** — Logout
> Users must be able to log out from any screen.
- Acceptance: `auth.signOut()` called; `synapse_auth_status: false` set in storage; popup closes; `welcome.html` tab opens.
- Source: `popup/auth-ui.js` → `navLogoutBtn` handler

**REQ-006** — Password Reset via Email
> Users must be able to request a password reset email from the login screen.
- Acceptance: `sendPasswordResetEmail(auth, email)` called with user-entered email; success message displayed.
- Source: `popup/auth-ui.js` → `forgotPasswordLink` handler, `popup/auth.js` → `resetPassword()`

**REQ-007** — Password Change (Email Provider Only)
> Authenticated email/password users must be able to change their password after re-authenticating.
- Acceptance: User re-authenticated with `EmailAuthProvider.credential`; `updatePassword` called with new password; Google users see informational message instead.
- Source: `popup/security.js` → `changePassword()`

**REQ-008** — Auth State Persistence
> Authentication state must persist across popup open/close cycles without requiring re-login.
- Acceptance: `synapse_auth_status` read from `chrome.storage.local` on popup init; correct screen shown immediately.
- Source: `popup/auth-ui.js` init block

**REQ-009** — Cross-Context Auth Sync
> Auth state changes must be reflected immediately across popup and content scripts without page reload.
- Acceptance: `chrome.storage.onChanged` listener in both `auth-ui.js` and `content.js` responds to `synapse_auth_status` changes within the same session.
- Source: `popup/auth-ui.js`, `content.js`

**REQ-010** — External Auth Bridge
> The extension must accept auth state from the `synapse-ai.app` web domain via `chrome.runtime.onMessageExternal`.
- Acceptance: `externalAuth` message with user payload sets `synapse_auth_status` and `synapse_auth_user` in local storage.
- Source: `background.js` → `onMessageExternal` handler, `manifest.json` → `externally_connectable`

---

## Onboarding Requirements

**REQ-011** — Welcome Page on First Install
> On first install, the extension must open a new tab to `welcome.html`.
- Acceptance: `chrome.runtime.onInstalled` with `reason === "install"` creates a new tab pointing to `welcome.html`.
- Source: `background.js` → `onInstalled` handler

**REQ-012** — Standalone Auth Portal
> `welcome.html` must function as a full standalone authentication page independent of the popup.
- Acceptance: `welcome.js` handles email/password login, registration, and Google OAuth; syncs auth to extension storage after success.
- Source: `welcome.js`, `welcome.html`

---

## Content Script Requirements

**REQ-013** — Synapse Button Injection
> A Synapse button (◉) must be injected into the input toolbar of ChatGPT, Claude, Gemini, and Perplexity.
- Acceptance: Button visible in input area on all four platforms; does not appear when user is not authenticated.
- Source: `content.js` → `checkAndInjectButton()`, `findTargetContainer()`

**REQ-014** — Auth-Gated Button Visibility
> The Synapse button must not be displayed if the user is not authenticated.
- Acceptance: `window.synapseIsAuthenticated` checked before injection; button removed on logout via `storage.onChanged`.
- Source: `content.js` auth state block

**REQ-015** — Conversation Extraction (ChatGPT)
> The content script must extract all conversation turns from ChatGPT using multiple DOM selector fallbacks.
- Acceptance: Messages extracted via `[data-message-author-role]`, then `article[data-testid^="conversation-turn"]`, then `.group/conversation-turn`, then generic class fallback — in priority order.
- Source: `content.js` → `extractRecentMessages()` ChatGPT branch

**REQ-016** — Conversation Extraction (Claude)
> The content script must extract conversation turns from Claude.
- Acceptance: Messages extracted via `[data-testid="human-turn"]` and `[data-testid="ai-turn"]`; class-based fallback if not found.
- Source: `content.js` → `extractRecentMessages()` Claude branch

**REQ-017** — Conversation Extraction (Gemini)
> The content script must extract conversation turns from Gemini.
- Acceptance: Messages extracted via `user-query`, `model-response`, and `[data-turn-role]` selectors.
- Source: `content.js` → `extractRecentMessages()` Gemini branch

**REQ-018** — Attachment Detection
> The content script must detect and annotate file attachments referenced in conversation DOM elements.
- Acceptance: File cards matching `.attachment`, `.file-card`, `a[href*=".pdf"]`, and related selectors are replaced with `[Attached File: filename]` text nodes before text extraction.
- Source: `content.js` → `getCleanText()`, `detectAttachmentsInElement()`

**REQ-019** — Deduplication of Extracted Messages
> Extracted messages must be deduplicated before processing.
- Acceptance: Messages with matching first-50-character keys are filtered; only unique messages passed to capsule generator.
- Source: `content.js` → `extractRecentMessages()` dedup block

---

## Capsule Generation Requirements

**REQ-020** — AI-Powered Capsule Generation via Groq
> Capsule generation must call the Groq API with `llama-3.1-8b-instant` to produce a structured JSON memory object.
- Acceptance: POST to `https://api.groq.com/openai/v1/chat/completions` with conversation turns; response parsed into capsule JSON with `layer1_identity`, `layer2_architecture`, `layer3_state`, `layer4_facts`, `document_summary`, `user_preferences`.
- Source: `content.js` → `generateCapsule()`

**REQ-021** — Local Fallback Capsule Generation
> If the Groq API call fails, a local heuristic-based capsule must be generated.
- Acceptance: `generateCapsuleLocally()` produces a valid capsule object from extracted messages without any network call.
- Source: `content.js` → `generateCapsuleLocally()`

**REQ-022** — Smart Title Generation
> Capsule project title must be automatically inferred from the page title or first user message.
- Acceptance: `generateSmartTitle()` tries page title first (stripped of platform name), then noun-phrase extraction from first user message; empty string returned if no valid title found.
- Source: `content.js` → `generateSmartTitle()`

**REQ-023** — Project Name Validation
> Generated project names must be validated before use as capsule keys.
- Acceptance: `validateProjectName()` rejects names shorter than 4 chars, fewer than 3 words without title keywords, or containing forbidden status words (done, next, step, error, etc.).
- Source: `content.js` → `validateProjectName()`

**REQ-024** — Capsule Key Format
> Capsule keys must follow the `@CAP-PROJECTNAME` format.
- Acceptance: Key is uppercase-slugified project name prefixed with `@CAP-`.
- Source: `content.js` capsule key construction

**REQ-025** — Loading Animation During Generation
> A loading animation must cycle through status messages during capsule generation.
- Acceptance: `showLoadingAnimation()` cycles through "🧠 Building Project Memory", "📄 Processing Documents", "🔍 Extracting Facts", "⚡ Generating Capsule", "✅ Capsule Ready" at 2-second intervals.
- Source: `content.js` → `showLoadingAnimation()`

---

## Capsule Storage Requirements

**REQ-026** — Save Capsule to Cloud (Flat Collection)
> Generated capsules must be saved to `capsules/{capsuleId}` in Firestore.
- Acceptance: `setDoc(doc(db, "capsules", capsule.id), capsuleData)` succeeds; `owner_uid` included.
- Source: `background.js` → `saveCapsule` handler

**REQ-027** — Save Capsule to Project Subcollection
> Capsules must also be written to `users/{uid}/projects/{projectId}/capsules/{capsuleId}`.
- Acceptance: Project document created/updated; capsule written to subcollection with same data.
- Source: `background.js` → `saveCapsule` project sync block

**REQ-028** — Update Semantic Memory Summary
> Each capsule save must update the user's semantic memory summary document.
- Acceptance: `setDoc(memory/{uid}, {lastProject, allTopics, allConcepts, sessionCount: increment(1)}, {merge: true})` succeeds.
- Source: `background.js` → `saveCapsule` memory block

**REQ-029** — Save Facts to Project Subcollection
> Facts extracted in the capsule must be written to `users/{uid}/projects/{pid}/facts/{factId}`.
- Acceptance: Each fact in `stored_facts` or `hard_facts` written with `type`, `value`, `importance`; fact ID is slugified fact text.
- Source: `background.js` → `saveCapsule` facts block

**REQ-030** — Save Decisions to Project Subcollection
> User decisions from the capsule must be written to `users/{uid}/projects/{pid}/decisions/{decisionId}`.
- Acceptance: Each string in `user_decisions` written as a separate decision document.
- Source: `background.js` → `saveCapsule` decisions block

**REQ-031** — Save Project State
> Current project state must be written to `users/{uid}/projects/{pid}/state/current`.
- Acceptance: `currentStep`, `nextStep`, `completed[]`, `inProgress[]`, `blockedBy[]` written from capsule fields.
- Source: `background.js` → `saveCapsule` state block

**REQ-032** — Save Local Capsule to chrome.storage
> Capsules must be available in `chrome.storage.local` for fast local resolution.
- Acceptance: `capsules` array in local storage is the primary read source; Firestore is the fallback.
- Source: `popup/popup.js` → `loadCapsules()`, `content.js` → `safeStorageGet`

---

## Capsule Injection Requirements

**REQ-033** — Capsule Recall via @CAP Syntax
> Typing `@CAP-KEY` in any supported LLM input and pressing Enter must inject the full capsule context.
- Acceptance: `keydown` listener detects Enter with `@CAP-` prefix in input; capsule resolved locally or from Firestore; memory prompt injected and submitted.
- Source: `content.js` → Enter keypress handler

**REQ-034** — Local-First Capsule Resolution
> Capsule resolution must check local storage before querying Firestore.
- Acceptance: `chrome.storage.local.get(['capsules'])` checked first; `resolveCapsule` message sent to background only if not found locally.
- Source: `content.js` → `resolveCapsuleKey()`

**REQ-035** — Platform-Specific Injection (ChatGPT)
> Capsule context must be injected into ChatGPT's React-managed input field.
- Acceptance: Native input value setter via `Object.getOwnPropertyDescriptor` used; synthetic `input` and `change` events dispatched to trigger React state update.
- Source: `content.js` → `PlatformAdapters.chatgpt.inject()`

**REQ-036** — Platform-Specific Injection (Claude)
> Capsule context must be injected into Claude's ProseMirror contenteditable editor.
- Acceptance: `document.execCommand('insertText')` used on Claude's contenteditable; fallback to clipboard paste if execCommand unavailable.
- Source: `content.js` → `PlatformAdapters.claude.inject()`

**REQ-037** — Platform-Specific Injection (Gemini)
> Capsule context must be injected into Gemini's Quill/Lexical-based editor.
- Acceptance: `ClipboardEvent` with `text/plain` data dispatched to trigger paste; fallback to direct value assignment.
- Source: `content.js` → `PlatformAdapters.gemini.inject()`

**REQ-038** — Platform-Specific Injection (Perplexity)
> Capsule context must be injected into Perplexity's native textarea.
- Acceptance: Direct `textarea.value` setter used; `input` event dispatched.
- Source: `content.js` → `PlatformAdapters.perplexity.inject()`

---

## Fact Scanner Requirements

**REQ-039** — Background Fact Extraction
> The content script must continuously scan conversations for extractable facts every 30 seconds.
- Acceptance: `setInterval` at 30,000ms calls fact scanner on `extractRecentMessages()` output.
- Source: `content.js` → fact scanner interval

**REQ-040** — Fact Categorization
> Extracted facts must be categorized into one of six types.
- Acceptance: Each fact assigned one of: `hardware_configuration`, `code_detail`, `system_configuration`, `user_decision`, `system_state`, `study_fact`.
- Source: `content.js` → fact scanner regex patterns

**REQ-041** — Per-URL Fact Storage
> Facts must be stored in `chrome.storage.local` keyed by the conversation URL.
- Acceptance: Facts stored as `{[conversationUrl]: [...facts]}` in local storage.
- Source: `content.js` → fact scanner storage block

---

## Document Vault Requirements

**REQ-042** — Vault File Upload (PDF, DOCX, PPTX, TXT)
> Users must be able to upload PDF, DOCX, PPTX, and TXT files to the document vault from the popup.
- Acceptance: File input accepts `.pdf,.docx,.doc,.pptx,.ppt,.txt`; file processed and added to vault list.
- Source: `popup/popup.html` → `vaultFileInput`, `popup/popup.js` → `processVaultFiles()`

**REQ-043** — In-Browser PDF Text Extraction
> PDF text must be extracted entirely in-browser using PDF.js without server upload.
- Acceptance: `libs/pdf.min.js` loaded on demand; text extracted from all pages; result stored in vault.
- Source: `popup/popup.js` → PDF processing block, `manifest.json` → `web_accessible_resources`

**REQ-044** — In-Browser DOCX Text Extraction
> DOCX text must be extracted in-browser using Mammoth.js.
- Acceptance: `libs/mammoth.min.js` loaded on demand; `extractRawText` called; result stored in vault.
- Source: `popup/popup.js` → DOCX processing block

**REQ-045** — AI-Powered PDF Summarization
> Uploaded PDFs must be summarized by the Groq API to extract `summary`, `concepts[]`, and `facts[]`.
- Acceptance: `processPDF` message sent to background.js; Groq called with up to 8000 chars of text; structured response saved to Firestore `documents/{docId}` and project subcollection.
- Source: `background.js` → `processPDF` handler, `summarizeAndExtractConceptsFromPDF()`

**REQ-046** — Text Compression for Vault Documents
> Large text documents must be compressed before storage using a head+tail strategy.
- Acceptance: `compressTextLocally(raw, maxChars)` produces a string with 60% from start and 40% from end, joined by `[...compressed...]`.
- Source: `popup/popup.js` → `compressTextLocally()`

**REQ-047** — Vault Cloud Sync
> Vault documents must be synced from Firestore on popup open.
- Acceptance: `syncVaultWithCloud()` queries Firestore `vault` collection and merges with local storage.
- Source: `popup/popup.js` → `syncVaultWithCloud()`

**REQ-048** — Document Selector for Capsule Generation
> Users must be able to choose which vault documents to include when generating a capsule.
- Acceptance: `showDocumentSelector()` modal shown before capsule generation; selected documents attached to capsule's `document_context`.
- Source: `popup/popup.js` → `showDocumentSelector()`

---

## Popup Dashboard Requirements

**REQ-049** — Dashboard Stats Display
> The dashboard must show aggregate counts for Projects, Documents, Facts, and Capsules.
- Acceptance: `dash-stat-projects`, `dash-stat-documents`, `dash-stat-facts`, `dash-stat-capsules` elements updated from Firestore data on dashboard load.
- Source: `popup/popup.html` dashboard screen, `popup/popup.js` → `loadDashboard()`

**REQ-050** — Recent Projects List
> The dashboard must show a list of recent projects with action buttons.
- Acceptance: `recentProjectsList` populated from `users/{uid}/projects` subcollection; each project shows View Memory, View Documents, and Generate Capsule actions.
- Source: `popup/popup.js` → `loadDashboard()`

**REQ-051** — Offline Detection Banner
> The popup must display an offline warning banner when Firestore is unavailable.
- Acceptance: `offlineBanner` element shown when Firestore connection fails; message reads "Firestore is offline. Memory sync & capsule generation are suspended."
- Source: `popup/popup.html` → `offlineBanner`, `popup/popup.js` → `updateOfflineStatus()`

**REQ-052** — Capsule Deletion (Local + Cloud)
> Users must be able to delete capsules from both local storage and Firestore.
- Acceptance: `deleteCapsule(id)` removes from `capsules` array in local storage and calls `deleteDoc(doc(db, "capsules", id))`.
- Source: `popup/popup.js` → `deleteCapsule()`

---

## Profile Requirements

**REQ-053** — Profile Display
> The profile screen must display the user's name, email, auth provider, and join date.
- Acceptance: Data loaded from `users/{uid}` Firestore document; displayed in `profileName`, `profileEmail`, `profileProviderDisplay`, `profileJoinedDisplay` fields.
- Source: `popup/auth-ui.js` → `onAuthStateChange` profile block

**REQ-054** — Profile Name Update
> Users must be able to update their display name.
- Acceptance: `updateUserProfile(name)` calls `updateDoc(users/{uid}, {name})`; header avatar and display name updated in UI immediately.
- Source: `popup/profile.js` → `updateUserProfile()`, `popup/auth-ui.js` → `profileForm` handler

**REQ-055** — Avatar Initials Display
> User avatar must show the first two uppercase characters of the user's display name.
- Acceptance: `headerAvatar` and `profileImagePreview` elements show initials; Google profile photo used if `photoURL` is present.
- Source: `popup/auth-ui.js` → `onAuthStateChange` avatar block
