# Tasks — Popup Dashboard

## Implementation Status

All tasks in this spec are **COMPLETED** as of v1.0.

---

## Task List

- [x] **Task 1** — Implement 8-screen SPA shell in `popup.html`
  - [x] All 8 screen divs with IDs
  - [x] CSS `.screen` (display:none) + `.screen.active` (display:flex)
  - [x] `fadeIn` CSS animation keyframe
  - [x] Design token CSS variables (--primary, --secondary, --bg, etc.)

- [x] **Task 2** — Implement `showScreen(screenId)` in `auth-ui.js`
  - [x] Remove `.active` from all screens
  - [x] Add `.active` to target screen
  - [x] Auth gate: if `!isAuthSynced`, force to `auth` screen

- [x] **Task 3** — Implement `loadDashboard()` in `popup.js`
  - [x] Query `users/{uid}/projects` subcollection
  - [x] Aggregate counts for stats grid
  - [x] Render `#recentProjectsList` from project data
  - [x] Update `#dash-stat-projects`, `#dash-stat-documents`, `#dash-stat-facts`, `#dash-stat-capsules`

- [x] **Task 4** — Implement project action drawer
  - [x] Click handler on project list items → `#projectActionContainer` shown
  - [x] `#activeProjectName` populated
  - [x] `#btnViewMemory` → open `#dashboardDetailsModal` with memory content
  - [x] `#btnViewDocuments` → open `#dashboardDetailsModal` with documents list
  - [x] `#btnGenerateCapsule` → `chrome.tabs.query` active tab + `sendMessage`
  - [x] `#closeProjectActions` → hide drawer

- [x] **Task 5** — Implement `loadCapsules()` in `popup.js`
  - [x] `safeStorageGet(['capsules', 'synapse_auth_user'])`
  - [x] Filter capsules by `owner_uid`
  - [x] Render capsule items with `safeAttr()` sanitization
  - [x] Delete button handler → `deleteCapsule(id)`

- [x] **Task 6** — Implement `deleteCapsule(id)` in `popup.js`
  - [x] Remove from local `capsules` array
  - [x] `safeStorageSet` updated array
  - [x] `deleteDoc(doc(db, "capsules", id))` — Firestore delete
  - [x] Re-render capsule list

- [x] **Task 7** — Implement `syncWithCloud()` in `popup.js`
  - [x] `sendMessage({action: "syncCapsules"})`
  - [x] Merge returned capsules into local storage (no duplicates by `id`)

- [x] **Task 8** — Implement `updateOfflineStatus()` in `popup.js`
  - [x] Show/hide `#offlineBanner` based on Firestore connectivity

- [x] **Task 9** — Implement header avatar and dropdown
  - [x] `#headerAvatar` click → `#profileDropdown.classList.toggle('show')`
  - [x] `document.addEventListener('click')` → close on outside click
  - [x] `.nav-btn[data-target]` delegation for all dropdown items

- [x] **Task 10** — Implement profile form in `auth-ui.js`
  - [x] `#profileForm` submit → `updateUserProfile(name)` → update avatar + display name
  - [x] Populate fields from `getUserProfile()` Firestore data
  - [x] Handle Google photo URL vs initials display

- [x] **Task 11** — Implement status badge updates
  - [x] `#statusBadge` and `#statusText` toggled between `status-connected` / `status-disconnected`
  - [x] Pulse animation on connected dot

- [x] **Task 12** — Implement mock Chrome APIs in popup.js
  - [x] `window.chrome` mock for non-extension browser context
  - [x] Covers `storage.local.get/set`, `tabs.query`, `tabs.sendMessage`

---

## V1.1 Pending Tasks

- [ ] **Task 13** — Implement `onSnapshot` real-time capsule sync
  - Replace one-shot `syncCapsules` message with Firestore `onSnapshot` listener
  - Popup updates in real-time when new capsules are saved
  - `onSnapshot` is already imported in `popup/firebase.js` but unused

- [ ] **Task 14** — Add capsule search/filter
  - Allow filtering capsule list by project name or key
  - Useful once users accumulate many capsules
