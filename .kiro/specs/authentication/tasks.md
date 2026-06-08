# Tasks — Authentication

## Implementation Status

All tasks in this spec are **COMPLETED** as of v1.0.

---

## Task List

- [x] **Task 1** — Set up Firebase SDK (local copies)
  - [x] Bundle `firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js` in `libs/firebase/`
  - [x] Create `popup/firebase.js` with `initializeApp`, `getAuth`, `getFirestore`
  - [x] Export all required functions for use across popup module

- [x] **Task 2** — Implement `popup/auth.js` wrapper functions
  - [x] `loginUser(email, password)` — sign in + update Firestore `lastLogin`
  - [x] `registerUser(name, email, password)` — create user + Firestore profile + `updateProfile`
  - [x] `loginWithGoogle()` — `signInWithPopup` with service worker fallback
  - [x] `logoutUser()` — `auth.signOut()`
  - [x] `onAuthStateChange(callback)` — wraps `onAuthStateChanged`, syncs to `chrome.storage.local`
  - [x] `getCurrentUser()` — returns `auth.currentUser`
  - [x] `resetPassword(email)` — `sendPasswordResetEmail`

- [x] **Task 3** — Implement `welcome.js` auth portal
  - [x] Tab switching between Sign In / Sign Up modes
  - [x] Form submit handler for email/password (login + register)
  - [x] Google OAuth button handler
  - [x] `syncAuthWithExtension(user, name)` — writes to storage + sends `authChange` message
  - [x] `showSuccess()` — success state transition

- [x] **Task 4** — Implement `popup/auth-ui.js` screen router
  - [x] Read `synapse_auth_status` from storage on init
  - [x] `showScreen(screenId)` with auth gate (unauthenticated → forced to 'auth')
  - [x] `chrome.storage.onChanged` listener for instant sync
  - [x] Header avatar click → dropdown toggle
  - [x] `document.addEventListener('click')` to close dropdown on outside click
  - [x] `.nav-btn[data-target]` navigation handlers
  - [x] Auth tab switching (login/register mode)
  - [x] `forgotPasswordLink` click handler
  - [x] `authForm` submit handler (delegates to `loginUser` / `registerUser`)
  - [x] `btnGoogleLogin` click handler (delegates to `loginWithGoogle`)
  - [x] `btnLaunchAuth` click → `chrome.tabs.create(welcome.html)` + `window.close()`
  - [x] `navLogoutBtn` click → clear storage → `logoutUser()` → open welcome.html → close popup
  - [x] `onAuthStateChange` listener → populate profile + call `onAuthSuccess` callback

- [x] **Task 5** — Implement `popup/profile.js`
  - [x] `getUserProfile()` — `getDoc(users/{uid})` with auth fallback
  - [x] `updateUserProfile(name)` — `updateDoc(users/{uid}, {name})`

- [x] **Task 6** — Implement `popup/security.js`
  - [x] `changePassword(currentPassword, newPassword)` — reauthenticate + `updatePassword`
  - [x] Google provider block with descriptive error

- [x] **Task 7** — Implement background.js auth handlers
  - [x] `getCurrentUserAsync()` with 1s timeout fallback
  - [x] `onMessage: login` — `signInWithPopup` for service worker context
  - [x] `onMessage: checkAuth` — return current user data
  - [x] `onMessageExternal: externalAuth` — set storage from `synapse-ai.app`
  - [x] `onInstalled` — open `welcome.html` on first install

- [x] **Task 8** — Implement content.js auth state watcher
  - [x] Read `synapse_auth_status` on script load
  - [x] `chrome.storage.onChanged` listener — show/hide Synapse button on auth change
  - [x] `isChromeContextValid()` guard for all storage calls

---

## V1.1 Pending Tasks

- [ ] **Task 9** — Add Firestore Security Rules
  - No `firestore.rules` file present in repository
  - Must enforce `request.auth.uid == resource.data.owner_uid` for capsule reads/writes
  - Must enforce `request.auth.uid == uid` for user document reads/writes

- [ ] **Task 10** — Validate `externalAuth` message with Firebase token
  - Currently accepts user payload from `synapse-ai.app` without verifying a Firebase ID token
  - Should verify `request.idToken` via Firebase Admin SDK or Firestore REST before trusting
