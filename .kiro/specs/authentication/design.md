# Design — Authentication

## Overview

Authentication in Synapse AI Link is split across two entry points: `welcome.html` (the primary auth portal) and `background.js` (Google OAuth fallback). The popup itself redirects to `welcome.html` rather than hosting auth inline — this is an intentional architectural decision (ADR-010) due to Chrome Extension popup limitations with OAuth popups.

---

## Auth Architecture

```mermaid
graph TB
    subgraph popup["Extension Popup"]
        AUTH_SCREEN["authScreen\nSign In on Website btn"]
        AUTH_UI["auth-ui.js\nScreen router"]
        STORAGE_WATCH["storage.onChanged\nAuth state watcher"]
    end

    subgraph welcome["welcome.html (New Tab)"]
        WH["Email/Password form\nGoogle button"]
        WJS["welcome.js\nAuth handler"]
    end

    subgraph background["background.js (Service Worker)"]
        MSG_LOGIN["onMessage: login\nGoogle OAuth fallback"]
        MSG_EXT["onMessageExternal: externalAuth\nsynapse-ai.app bridge"]
    end

    subgraph firebase["Firebase"]
        FB_AUTH["Firebase Auth\nEmail + Google"]
        FS_USERS["Firestore\nusers/{uid}"]
    end

    subgraph storage["chrome.storage.local"]
        AUTH_STATUS["synapse_auth_status: bool"]
        AUTH_USER["synapse_auth_user: object"]
    end

    AUTH_SCREEN -->|"tabs.create(welcome.html)"| welcome
    WJS --> FB_AUTH
    WJS --> FS_USERS
    WJS -->|"set"| storage
    WJS -->|"sendMessage(authChange)"| background
    MSG_LOGIN --> FB_AUTH
    MSG_LOGIN --> FS_USERS
    MSG_EXT -->|"set"| storage
    storage -->|"onChanged"| STORAGE_WATCH
    STORAGE_WATCH --> AUTH_UI
    AUTH_UI -->|"showScreen"| popup
```

---

## Screen Routing Logic

```mermaid
flowchart TD
    A["Popup Opens"] --> B["Read synapse_auth_status\nfrom chrome.storage.local"]
    B --> C{isAuthSynced?}
    C -->|false| D["showScreen('auth')\nBlocked from all other screens"]
    C -->|true| E["showScreen('dashboard')"]
    E --> F["onAuthStateChanged fires"]
    F --> G["Load profile from Firestore\nusers/{uid}"]
    G --> H["Populate avatar, name, email\nCall onAuthSuccess callback"]

    D --> I["User clicks 'Sign In on Website'"]
    I --> J["chrome.tabs.create(welcome.html)\nwindow.close()"]
    J --> K["Auth completes in welcome.html"]
    K --> L["storage.set synapse_auth_status: true"]
    L --> M["storage.onChanged fires in popup\nif popup is open"]
    M --> E
```

---

## Firestore User Document

Written on first login and updated on every subsequent login:

```javascript
// Created on registration
{
  uid: "firebase-uid",
  name: "Display Name",
  email: "user@example.com",
  provider: "email" | "google",
  createdAt: "2024-01-15T10:30:00.000Z",  // ISO string, set once
  lastLogin: "2024-06-08T14:22:00.000Z"   // ISO string, updated on every login
}
```

**Note:** `createdAt` must never be overwritten on subsequent logins — code checks `userDoc.exists()` and only calls `updateDoc` for `lastLogin` if document already exists.

---

## Service Worker Cold Start Handling

```javascript
function getCurrentUserAsync() {
    return new Promise((resolve) => {
        // Case 1: Already available (warm service worker)
        if (auth.currentUser) {
            resolve(auth.currentUser);
            return;
        }
        // Case 2: Wait for Firebase to restore from IndexedDB
        const unsubscribe = auth.onAuthStateChanged((user) => {
            unsubscribe();
            resolve(user);
        });
        // Case 3: Hard timeout — resolve with whatever is available after 1s
        setTimeout(() => {
            resolve(auth.currentUser);
        }, 1000);
    });
}
```

**Why this matters:** Chrome MV3 service workers terminate after ~30 seconds of inactivity. When they restart (cold start), Firebase Auth needs time to restore the session from IndexedDB before `auth.currentUser` is populated. The timeout ensures operations don't hang indefinitely.

---

## Google OAuth — Popup Blocked Fallback

```mermaid
sequenceDiagram
    participant AUI as auth-ui.js
    participant AuthJS as auth.js
    participant FB as Firebase Auth
    participant BG as background.js

    AUI->>AuthJS: loginWithGoogle()
    AuthJS->>FB: signInWithPopup(auth, GoogleAuthProvider)
    FB--xAuthJS: Error: popup-blocked / popup-closed
    AuthJS->>BG: sendMessage({action: "login"})
    BG->>FB: signInWithPopup(auth, provider)
    Note over BG,FB: Background service worker can open popups
    FB-->>BG: result.user
    BG->>BG: Create/update users/{uid} in Firestore
    BG-->>AuthJS: {success: true}
```

---

## Security Considerations

| Concern | Implementation |
|---|---|
| Password change requires current password | `reauthenticateWithCredential` before `updatePassword` |
| Google users blocked from email password change | `user.providerData.some(p => p.providerId === 'google.com')` check in `security.js` |
| Auth status in storage is a UI hint only | Firebase SDK enforces actual token validity on all API calls |
| External auth from `synapse-ai.app` | Limited by `externally_connectable` in manifest; only that domain can send external messages |
| Unauthenticated users blocked from all screens | `showScreen()` forces `auth` screen if `!isAuthSynced` |
