# Requirements — Popup Dashboard

## Overview
The popup is the central control surface of the extension — a 320px-wide 8-screen SPA that gives users access to their capsules, vault, project stats, and account settings. It communicates with the service worker and directly with Firestore.

---

## Requirements

### 1 — Multi-Screen SPA Navigation

**User Story:** As a user, I want a unified dashboard where I can access all features without opening new tabs.

**Acceptance Criteria:**

- 1.1 — The popup renders 8 named screens: `authScreen`, `dashboardScreen`, `mainAppScreen`, `profileScreen`, `securityScreen`, `guidelinesScreen`, `contactScreen`, `aboutScreen`
- 1.2 — Only one screen is visible at a time via `.active` CSS class toggling
- 1.3 — Navigation occurs via `.nav-btn[data-target]` elements (back buttons, dropdown items)
- 1.4 — Screen transitions use a `fadeIn` CSS animation (0.3s, translateX from +10px)
- 1.5 — Unauthenticated users are blocked from all screens except `authScreen` regardless of `showScreen()` argument

### 2 — Dashboard Statistics

**User Story:** As a user, I want to see an overview of my saved projects, documents, facts, and capsules at a glance.

**Acceptance Criteria:**

- 2.1 — The dashboard shows a 2×2 stat grid with counts for: Projects, Documents, Facts, Capsules
- 2.2 — Stats are populated from Firestore project subcollection data via `loadDashboard()`
- 2.3 — Counts default to `0` before data loads

### 3 — Recent Projects List

**User Story:** As a user, I want to see my recent projects listed so I can quickly access their memory, documents, or generate a new capsule.

**Acceptance Criteria:**

- 3.1 — Recent projects are listed in `#recentProjectsList` loaded from `users/{uid}/projects`
- 3.2 — Clicking a project row opens `#projectActionContainer` action drawer
- 3.3 — Action drawer shows: "View Memory", "View Documents", "Generate Capsule" buttons
- 3.4 — "View Memory" and "View Documents" open `#dashboardDetailsModal` with project data
- 3.5 — "Generate Capsule" sends `generateCapsule` message to the active LLM tab via `chrome.tabs.sendMessage`
- 3.6 — Action drawer can be closed via the `✕` close button (`#closeProjectActions`)

### 4 — Capsule List (Main App Screen)

**User Story:** As a user, I want to see all my saved capsules and manage them from the popup.

**Acceptance Criteria:**

- 4.1 — `#capsuleList` renders all capsules from `chrome.storage.local` filtered by `owner_uid`
- 4.2 — Each capsule item shows its project name, key, and creation date
- 4.3 — Each capsule has a delete button that removes it from both local storage and `capsules/{id}` in Firestore
- 4.4 — Empty state shows "No context saved yet." message
- 4.5 — Capsule list scrolls independently (max-height: 160px, overflow-y: auto)

### 5 — Offline Detection

**User Story:** As a user, I want to be informed when the extension cannot reach Firebase so I know why sync and generation may not work.

**Acceptance Criteria:**

- 5.1 — `#offlineBanner` is shown at the top of the popup when Firestore is offline
- 5.2 — Banner reads: "Firestore is offline. Memory sync & capsule generation are suspended."
- 5.3 — Banner is orange (`#ea580c`) and sticky
- 5.4 — Banner disappears when connectivity is restored

### 6 — Profile Screen

**User Story:** As a user, I want to view and edit my display name and see my account details.

**Acceptance Criteria:**

- 6.1 — Profile screen shows avatar (initials or Google profile photo), name, email, auth provider, and join date
- 6.2 — User can edit their display name; submitting calls `updateUserProfile(name)` → `updateDoc(users/{uid}, {name})`
- 6.3 — Email field is disabled (read-only) — managed by auth provider
- 6.4 — Avatar initials are the first 2 uppercase characters of the display name
- 6.5 — If Google profile photo URL exists, it is shown as `background-image` on the avatar

### 7 — Header Avatar and Dropdown

**User Story:** As a user, I want a quick-access dropdown menu from my avatar to navigate to account settings and log out.

**Acceptance Criteria:**

- 7.1 — `#headerAvatar` is hidden when unauthenticated; shown when authenticated
- 7.2 — Clicking the avatar toggles `#profileDropdown` visibility
- 7.3 — Clicking anywhere outside the avatar/dropdown closes the dropdown
- 7.4 — Dropdown contains: Personal Information, Security, Community Guidelines, Contact & Support, Logout
- 7.5 — Status badge in header shows "Connected" (teal, pulsing dot) or "Disconnected" (red)
