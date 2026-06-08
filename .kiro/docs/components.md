# Components — Synapse AI Link

> Every component documented here corresponds to actual code files in the repository.

---

## Component Map

```mermaid
graph TB
    subgraph ext["Chrome Extension Package"]
        manifest["manifest.json\nExtension Blueprint"]
        bg["background.js\nService Worker"]
        cs["content.js\nContent Script"]
        subgraph popup["Popup Module"]
            ph["popup.html"]
            pj["popup.js"]
            aui["auth-ui.js"]
            aj["auth.js"]
            prf["profile.js"]
            sec["security.js"]
            fj["firebase.js"]
        end
        subgraph onboard["Onboarding Module"]
            wh["welcome.html"]
            wj["welcome.js"]
            wc["welcome.css"]
        end
        subgraph libs["libs/"]
            pdf["pdf.min.js"]
            pdfw["pdf.worker.min.js"]
            mam["mammoth.min.js"]
            fbapp["firebase/firebase-app.js"]
            fbauth["firebase/firebase-auth.js"]
            fbfs["firebase/firebase-firestore.js"]
        end
    end
```

---

## Component 1: `manifest.json` — Extension Blueprint

**Purpose:** Declares all extension capabilities, permissions, and entry points to the Chrome runtime.

**Responsibilities:**
- Defines Manifest V3 configuration
- Declares `activeTab`, `storage`, `scripting`, `tabs` permissions
- Lists `host_permissions` for 4 LLM sites + Firebase + Groq
- Registers `content.js` to run on all 4 LLM domains
- Registers `background.js` as ES Module service worker
- Sets `popup/popup.html` as default popup
- Exposes `libs/pdf.min.js`, `pdf.worker.min.js`, `mammoth.min.js` as web-accessible resources
- Allows external messages from `https://synapse-ai.app/*`

**Key Configuration:**
```json
{
  "manifest_version": 3,
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_popup": "popup/popup.html" },
  "externally_connectable": { "matches": ["https://synapse-ai.app/*"] }
}
```

**Dependencies:** None — root configuration file.

---

## Component 2: `background.js` — Service Worker

**Purpose:** Central message router and Firestore write coordinator. Runs as a Chrome MV3 service worker — event-driven, not persistent.

**Responsibilities:**

| Responsibility | Implementation |
|---|---|
| Handle `login` message | `signInWithPopup` → create/update `users/{uid}` → respond with user data |
| Handle `checkAuth` message | `getCurrentUserAsync()` with 1s timeout fallback |
| Handle `syncCapsules` message | Query `capsules` where `owner_uid == uid` → return array |
| Handle `saveCapsule` message | Write to up to 10 Firestore documents (flat + project subcollections) |
| Handle `resolveCapsule` message | Query `capsules` where `key == key` → return single doc |
| Handle `processPDF` message | Call Groq API → write to `documents/` + project subcollection |
| Handle `loadProjectMemory` message | Read all 6 project subcollections → return assembled project data |
| Handle `externalAuth` (external) | Set `synapse_auth_status` in local storage from `synapse-ai.app` |
| On `install` event | Open `welcome.html` tab |
| PDF summarization | `summarizeAndExtractConceptsFromPDF()` → Groq `llama-3.1-8b-instant` |

**Key Functions:**
- `summarizeAndExtractConceptsFromPDF(pdfText, filename)` — Groq API call, returns `{summary, concepts[], facts[]}`
- `getCurrentUserAsync()` — Promise-based Firebase Auth current user with timeout fallback
- `testFirestoreConnection()` — Dev utility (writes to `test_collection/test_connection`)

**Dependencies:**
- `popup/firebase.js` (all Firebase imports)
- Groq API (`https://api.groq.com/openai/v1/chat/completions`)
- `chrome.runtime`, `chrome.storage`, `chrome.tabs`

**File size:** ~970 lines

---

## Component 3: `content.js` — Content Script

**Purpose:** The live in-page engine. Injected into all four supported LLM websites. Handles everything visible inside the LLM tab.

**Responsibilities:**

| Responsibility | Implementation |
|---|---|
| Auth state tracking | Reads `synapse_auth_status` from local storage; reacts to `storage.onChanged` |
| DOM cleaning | `getCleanText()` strips UI elements, preserves file attachment references |
| Conversation scraping | `extractRecentMessages()` — 4 platform-specific scrapers with fallbacks |
| Attachment detection | `detectAttachmentsInElement()` — finds filename references in DOM |
| Platform detection | `getPlatformName()` — hostname-based routing |
| Smart title generation | `generateSmartTitle()` — page title → first user message noun phrase |
| Project name validation | `validateProjectName()`, `validateProjectPurpose()`, `hasForbiddenText()` |
| Capsule generation (AI) | Groq API call with structured prompt |
| Capsule generation (local) | `generateCapsuleLocally()` — heuristic fallback |
| Loading animation | `showLoadingAnimation()` / `stopLoadingAnimation()` cycling 5 messages |
| Button injection | `checkAndInjectButton()` — injects `◉` button into LLM input toolbar |
| Popover UI | Glassmorphic floating panel with title input + capsule library |
| Memory Inspector modal | Full 800×600 tabbed modal for viewing/editing capsule contents |
| Capsule injection | `@CAP-*` detection on Enter keypress → `resolveCapsuleKey()` → `PlatformAdapter.inject()` |
| Background fact scanner | `setInterval(30000)` → regex categorization → local storage update |
| Timeout utility | `promiseWithTimeout(promise, ms)` — wraps promises with timeout rejection |

**Platform Adapter Interface (per platform):**

```javascript
PlatformAdapters = {
  chatgpt:    { getInputBox(), getSendButton(), inject(text) },
  claude:     { getInputBox(), getSendButton(), inject(text) },
  gemini:     { getInputBox(), getSendButton(), inject(text) },
  perplexity: { getInputBox(), getSendButton(), inject(text) }
}
```

**Injected UI Elements:**
- `#synapse-input-btn` — the ◉ button in the input toolbar
- `#synapse-popover` — the floating context menu
- `#synapse-styles` — injected `<style>` tag with all UI CSS
- `#synapse-inspector-backdrop` — the Memory Inspector modal overlay

**Dependencies:**
- `chrome.storage`, `chrome.runtime`
- Groq API (direct fetch, same key as background.js)
- `libs/pdf.min.js`, `libs/mammoth.min.js` (lazy-loaded via `chrome.runtime.getURL`)

**File size:** ~5,057 lines

---

## Component 4: `popup/popup.html` — Extension Popup UI

**Purpose:** The 320px-wide extension popup. Single HTML file implementing an 8-screen SPA using CSS `display: none/flex` toggling.

**Screens implemented:**

| Screen ID | CSS Class Toggle | Purpose |
|---|---|---|
| `authScreen` | `.screen.active` | Auth gate — "Sign In on Website" button |
| `dashboardScreen` | `.screen.active` | 2×2 stats grid + recent projects |
| `mainAppScreen` | `.screen.active` | Saved capsules list + Document Vault |
| `profileScreen` | `.screen.active` | Name edit form + account info |
| `securityScreen` | `.screen.active` | Password change form + reset email |
| `guidelinesScreen` | `.screen.active` | Community guidelines text |
| `contactScreen` | `.screen.active` | Creator contact card |
| `aboutScreen` | `.screen.active` | Version + creator info |

**UI Components:**
- `.header` — title + status badge + avatar
- `.dropdown-menu` — profile dropdown (Personal Info / Security / Guidelines / Contact / Logout)
- `.capsule-list` — scrollable capsule list with delete buttons
- `#vaultDropZone` — drag-and-drop file upload zone
- `#vaultFilesList` — rendered vault file list
- `#projectActionContainer` — project action drawer (View Memory / View Documents / Generate Capsule)
- `#dashboardDetailsModal` — full-screen overlay for project memory/document views
- `#offlineBanner` — sticky top orange warning banner

**Design System (CSS Variables):**
```css
--primary: #00ffcc      /* Teal accent */
--secondary: #0099ff    /* Blue accent */
--bg: #0d0d15           /* Dark background */
--card-bg: rgba(255,255,255,0.05)
--border: rgba(255,255,255,0.08)
--error: #f43f5e
--success: #10b981
--font: 'Outfit', sans-serif
```

**Dependencies:** `popup.js` (loaded as `<script type="module">`)

---

## Component 5: `popup/popup.js` — Popup Controller

**Purpose:** Main controller for the popup's capsule management, vault operations, and dashboard data loading.

**Key Functions:**

| Function | Purpose |
|---|---|
| `safeStorageGet(keys, cb)` | Wraps `chrome.storage.local.get` with mock fallback for non-extension context |
| `safeStorageSet(data, cb)` | Wraps `chrome.storage.local.set` with mock fallback |
| `compressTextLocally(raw, maxChars)` | Head(60%) + tail(40%) text compression |
| `buildVaultItemHTML(docItem)` | Renders a vault file list item with status badge |
| `loadCapsules()` | Reads `capsules` from local storage, filters by `owner_uid`, renders list |
| `syncWithCloud()` | Sends `syncCapsules` to background, merges into local storage |
| `syncVaultWithCloud()` | Queries Firestore `vault` collection, merges with `synapse_vault` |
| `deleteCapsule(id)` | Removes from local storage array + `deleteDoc(db, "capsules", id)` |
| `processVaultFiles(files)` | Orchestrates in-browser file parsing + background PDF processing |
| `showDocumentSelector()` | Modal for selecting vault docs to include in capsule |
| `runCapsuleGeneration()` | Sends `generateCapsule` to active tab via `chrome.tabs.sendMessage` |
| `loadDashboard()` | Loads stats + recent projects from Firestore |
| `updateOfflineStatus()` | Shows/hides `offlineBanner` based on Firestore connectivity |
| `renderVault()` | Builds vault HTML from `vaultDocs` array |

**State Variables:**
- `vaultDocs[]` — in-memory vault document array
- `capsuleListEl` — reference to capsule list DOM element

**Mock Chrome APIs:**
The file includes a mock `window.chrome` object for running in non-extension browser contexts (development), covering `storage.local.get/set` and `tabs.query/sendMessage`.

**Dependencies:**
- `popup/firebase.js`
- `popup/auth-ui.js` → `initAuthUI()`
- `chrome.storage`, `chrome.tabs`, `chrome.runtime`

---

## Component 6: `popup/auth-ui.js` — Screen Router & Auth Event Handler

**Purpose:** Manages all 8 popup screens and handles every authentication form interaction.

**Key Behaviors:**
- Reads `synapse_auth_status` from `chrome.storage.local` on init to determine starting screen
- `showScreen(screenId)` — toggles `.active` class across all screens; blocks non-auth screens if not authenticated
- `chrome.storage.onChanged` listener — instant auth state sync without user action
- Handles `authForm` submit (email login + registration), `btnGoogleLogin`, `btnLaunchAuth`, `navLogoutBtn`
- Handles `forgotPasswordLink` click → `resetPassword(email)`
- Handles `profileForm` submit → `updateUserProfile(name)` + updates all avatar references
- Handles `securityForm` submit → `changePassword(currentPass, newPass)` with confirm match check
- `onAuthStateChange(user)` → populates profile screen data, triggers `onAuthSuccess(user)` callback

**Screen Navigation Rules:**
- Unauthenticated: always forced to `auth` screen regardless of `showScreen` argument
- Navigation via `.nav-btn[data-target]` elements (dropdown menu items, back buttons)
- Logout: clears storage → `logoutUser()` → `chrome.tabs.create(welcome.html)` → `window.close()`

**Dependencies:**
- `popup/auth.js`
- `popup/profile.js`
- `popup/security.js`
- `chrome.storage`, `chrome.tabs`, `chrome.runtime`

---

## Component 7: `popup/auth.js` — Firebase Auth Wrapper

**Purpose:** Provides clean async auth functions that wrap Firebase Auth SDK calls with Firestore profile management.

**Exported Functions:**

| Function | Firebase Call | Firestore Side Effect |
|---|---|---|
| `loginUser(email, password)` | `signInWithEmailAndPassword` | Update/create `users/{uid}` |
| `registerUser(name, email, password)` | `createUserWithEmailAndPassword` | Create `users/{uid}` doc |
| `loginWithGoogle()` | `signInWithPopup(GoogleAuthProvider)` | Create/update `users/{uid}` |
| `logoutUser()` | `auth.signOut()` | None |
| `onAuthStateChange(callback)` | `auth.onAuthStateChanged` | Sync to `chrome.storage.local` |
| `getCurrentUser()` | `auth.currentUser` | None |
| `resetPassword(email)` | `sendPasswordResetEmail` | None |

**Google OAuth Fallback:**
If `signInWithPopup` fails (popup blocked in extension context), falls back to `chrome.runtime.sendMessage({action: "login"})` to trigger auth via the background service worker.

**Dependencies:** `popup/firebase.js`

---

## Component 8: `popup/firebase.js` — Firebase SDK Init

**Purpose:** Initializes Firebase app, Auth, and Firestore instances. Exports all required SDK functions for use across the popup module.

**Firebase Config:**
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDbmFyO_yCEigshmTdaGO7EZ7jcbWG-aX0",
  authDomain: "synapse-ai-99dd0.firebaseapp.com",
  projectId: "synapse-ai-99dd0",
  storageBucket: "synapse-ai-99dd0.firebasestorage.app",
  messagingSenderId: "57638029332",
  appId: "1:57638029332:web:e26efcb030f017aaf0bf01"
};
```

**Exports:** `app`, `auth`, `provider` (GoogleAuthProvider), `db`, and all Auth/Firestore functions needed by other modules.

**Why local SDK copies:** Chrome Extension CSP prevents loading scripts from external CDNs. All Firebase SDK files are bundled locally in `libs/firebase/`.

**Dependencies:** `libs/firebase/firebase-app.js`, `libs/firebase/firebase-auth.js`, `libs/firebase/firebase-firestore.js`

---

## Component 9: `popup/profile.js` — Profile CRUD

**Purpose:** Firestore read/write operations for user profile documents.

**Functions:**
- `getUserProfile()` — `getDoc(users/{uid})`; fallback to `auth.currentUser` fields if document doesn't exist
- `updateUserProfile(name)` — `updateDoc(users/{uid}, {name})`

**Dependencies:** `popup/firebase.js`, `popup/auth.js` → `getCurrentUser()`

---

## Component 10: `popup/security.js` — Password Management

**Purpose:** Handles credential update with required reauthentication step.

**Functions:**
- `changePassword(currentPassword, newPassword)` — reauthenticates with `EmailAuthProvider.credential(email, currentPass)`, then calls `updatePassword(user, newPassword)`
- Blocks Google-authenticated users from this flow with an explicit error message

**Dependencies:** `popup/firebase.js`

---

## Component 11: `welcome.html` + `welcome.js` + `welcome.css` — Onboarding Auth Portal

**Purpose:** Standalone auth page opened as a new tab on first install or when user clicks "Sign In on Website" from the popup.

**welcome.js Responsibilities:**
- Tab switching between Sign In / Sign Up modes
- Email/password login and registration with Firestore profile creation
- Google OAuth login with profile creation
- `syncAuthWithExtension(user, displayName)` — writes to `chrome.storage.local` and sends `authChange` message to background
- `showSuccess()` — hides auth form, shows success UI after auth

**Dependencies:** `popup/firebase.js` (shared Firebase instance)

---

## Component 12: `libs/` — Bundled Third-Party Libraries

**Purpose:** All third-party libraries are bundled locally to comply with Chrome Extension CSP and enable offline operation.

| File | Library | Version | Purpose |
|---|---|---|---|
| `libs/pdf.min.js` | PDF.js | Bundled | In-browser PDF text extraction |
| `libs/pdf.worker.min.js` | PDF.js Worker | Bundled | Background thread for PDF parsing |
| `libs/mammoth.min.js` | Mammoth.js | Bundled | DOCX → plain text conversion |
| `libs/firebase/firebase-app.js` | Firebase App SDK | Bundled | App initialization |
| `libs/firebase/firebase-auth.js` | Firebase Auth SDK | Bundled | Authentication |
| `libs/firebase/firebase-firestore.js` | Firestore SDK | Bundled | Database operations |

**Access pattern:** PDF.js and Mammoth.js are lazy-loaded on demand via `chrome.runtime.getURL('libs/...')` to avoid impacting initial load time.
