# Requirements — Authentication

## Overview
Authentication gates all features of Synapse AI Link. Users must be signed in to generate, save, and sync capsules. The extension supports email/password and Google OAuth, with a web portal (welcome.html) as the auth entry point.

---

## Requirements

### 1 — User Registration

**User Story:** As a new user, I want to create an account with my name, email, and password so that my capsules are saved to my personal cloud storage.

**Acceptance Criteria:**

- 1.1 — Registration accepts full name, email address, and password (minimum 6 characters)
- 1.2 — `createUserWithEmailAndPassword` is called with the provided credentials
- 1.3 — A Firestore document is created at `users/{uid}` with `name`, `email`, `provider: 'email'`, `createdAt`, `lastLogin`
- 1.4 — Firebase Auth `displayName` is updated via `updateProfile(user, {displayName: name})`
- 1.5 — After success, `syncAuthWithExtension()` writes auth state to `chrome.storage.local` and sends `authChange` to background.js
- 1.6 — The auth form shows a success UI; the tab can be closed to return to the popup

### 2 — Email/Password Login

**User Story:** As a returning user, I want to sign in with my email and password to access my capsules.

**Acceptance Criteria:**

- 2.1 — `signInWithEmailAndPassword` is called with provided credentials
- 2.2 — `users/{uid}.lastLogin` is updated in Firestore on successful login
- 2.3 — If the user document doesn't exist (edge case), a new one is created
- 2.4 — `synapse_auth_status: true` and `synapse_auth_user` written to `chrome.storage.local`
- 2.5 — Firebase errors are displayed with "Firebase: " prefix stripped

### 3 — Google OAuth Login

**User Story:** As a user, I want to sign in with my Google account for a faster, passwordless login experience.

**Acceptance Criteria:**

- 3.1 — `signInWithPopup(auth, GoogleAuthProvider)` is called when user clicks "Continue with Google"
- 3.2 — New Google users get a Firestore `users/{uid}` document created; returning users get `lastLogin` updated
- 3.3 — If `signInWithPopup` throws a popup-blocked error in the extension context, the system falls back to `chrome.runtime.sendMessage({action: "login"})` which triggers auth in the background service worker
- 3.4 — Error messages for common failures are user-friendly: "Sign-in popup was closed before finishing", "Network error", "Google Sign-In failed"

### 4 — Auth State Persistence and Cross-Context Sync

**User Story:** As a user, I want to remain logged in across browser sessions and have my login state reflected immediately in the extension popup and all LLM tabs.

**Acceptance Criteria:**

- 4.1 — On popup open, `synapse_auth_status` is read from `chrome.storage.local` to determine the starting screen (auth or dashboard)
- 4.2 — `chrome.storage.onChanged` listener in `auth-ui.js` and `content.js` reacts to auth state changes without page reload
- 4.3 — Logging out in the popup immediately hides the Synapse button in all open LLM tabs
- 4.4 — Logging in via welcome.html immediately shows the Synapse button in open LLM tabs
- 4.5 — Firebase Auth SDK manages token refresh automatically via IndexedDB persistence

### 5 — Logout

**User Story:** As a user, I want to log out and have my session completely cleared from the extension.

**Acceptance Criteria:**

- 5.1 — `chrome.storage.local` sets `synapse_auth_status: false` and `synapse_auth_user: null`
- 5.2 — `auth.signOut()` is called to terminate the Firebase session
- 5.3 — `welcome.html` opens in a new tab after logout
- 5.4 — The popup closes after logout

### 6 — Password Reset

**User Story:** As a user who has forgotten their password, I want to request a reset email from the login screen.

**Acceptance Criteria:**

- 6.1 — A "Forgot?" link is visible on the login tab
- 6.2 — Clicking it reads the email field; if empty, shows an error asking for email first
- 6.3 — `sendPasswordResetEmail(auth, email)` is called
- 6.4 — Success message is shown: "Password reset email sent. Please check your inbox."
- 6.5 — Password reset is also available from the Security screen for authenticated users

### 7 — Password Change

**User Story:** As an authenticated email/password user, I want to change my password after confirming my current password.

**Acceptance Criteria:**

- 7.1 — The Security screen shows the password change form only for email/password users
- 7.2 — Google-authenticated users see an informational message directing them to Google Account settings; the form is hidden
- 7.3 — Client-side validation confirms new password and confirm password match before any API call
- 7.4 — `reauthenticateWithCredential(user, EmailAuthProvider.credential(email, currentPassword))` is called before `updatePassword`
- 7.5 — Reauthentication errors are shown to the user clearly

### 8 — External Auth Bridge

**User Story:** As a user who authenticates via the `synapse-ai.app` website, I want the extension to automatically recognize my login without requiring me to sign in again through the popup.

**Acceptance Criteria:**

- 8.1 — `background.js` listens via `chrome.runtime.onMessageExternal` for `{action: "externalAuth"}` messages
- 8.2 — Only messages from `https://synapse-ai.app/*` are accepted (enforced by `manifest.json` `externally_connectable`)
- 8.3 — The received user payload is written to `chrome.storage.local` as `synapse_auth_status` and `synapse_auth_user`
- 8.4 — `chrome.runtime.sendMessage({action: "authChange"})` is dispatched to notify the popup
