# Authentication — Synapse AI Link

> All authentication flows documented here reflect actual code implementation.

---

## Authentication Architecture Overview

```mermaid
graph TB
    subgraph authSources["Auth Entry Points"]
        EP1["welcome.html\n(Email / Google)"]
        EP2["popup inline auth\n(redirects to welcome.html)"]
        EP3["synapse-ai.app\n(external bridge)"]
    end

    subgraph authEngine["Auth Engine"]
        FBAuth["Firebase Auth\n(SDK in libs/firebase-auth.js)"]
        BG["background.js\n(Google OAuth fallback)"]
    end

    subgraph authState["Auth State Stores"]
        LS_STATUS["chrome.storage.local\nsynapse_auth_status: bool\nsynapse_auth_user: object"]
        FS_PROFILE["Firestore\nusers/{uid}"]
    end

    subgraph authConsumers["Auth Consumers"]
        CS["content.js\n(button visibility)"]
        AUI["auth-ui.js\n(screen routing)"]
        PJS["popup.js\n(capsule ownership)"]
        BGAUTH["background.js\n(capsule owner_uid)"]
    end

    EP1 --> FBAuth
    EP2 -->|"chrome.tabs.create(welcome.html)"| EP1
    EP3 -->|"onMessageExternal: externalAuth"| BG
    FBAuth --> LS_STATUS
    FBAuth --> FS_PROFILE
    BG --> LS_STATUS
    LS_STATUS --> CS
    LS_STATUS --> AUI
    LS_STATUS --> PJS
    LS_STATUS --> BGAUTH
```

---

## Auth Provider Support

| Provider | Implementation | User Data Source |
|---|---|---|
| Email / Password | `signInWithEmailAndPassword`, `createUserWithEmailAndPassword` | `users/{uid}` in Firestore |
| Google OAuth | `signInWithPopup(auth, GoogleAuthProvider)` | `users/{uid}` in Firestore |
| External (synapse-ai.app) | `chrome.runtime.onMessageExternal` | Passed in message payload |

---

## Flow 1: Email Registration

```mermaid
sequenceDiagram
    actor User
    participant WH as welcome.html
    participant WJS as welcome.js
    participant FBAuth as Firebase Auth
    participant FS as Firestore
    participant LS as chrome.storage.local
    participant BG as background.js

    User->>WH: Clicks Sign Up tab
    User->>WH: Enters name, email, password
    User->>WH: Submits form
    WJS->>FBAuth: createUserWithEmailAndPassword(auth, email, password)
    FBAuth-->>WJS: userCredential
    WJS->>FBAuth: updateProfile(user, {displayName: name})
    WJS->>FS: setDoc(users/{uid}, {uid, name, email, createdAt, lastLogin})
    WJS->>LS: set({synapse_auth_status: true, synapse_auth_user: {uid, email, name}})
    WJS->>BG: sendMessage({action: "authChange", user})
    WJS->>WH: showSuccess() — hide form, show success message
```

---

## Flow 2: Email Login

```mermaid
sequenceDiagram
    actor User
    participant WJS as welcome.js
    participant FBAuth as Firebase Auth
    participant FS as Firestore
    participant LS as chrome.storage.local

    User->>WJS: Submits email + password
    WJS->>FBAuth: signInWithEmailAndPassword(auth, email, password)
    FBAuth-->>WJS: userCredential
    WJS->>FS: getDoc(users/{uid})
    alt Document exists
        WJS->>FS: updateDoc(users/{uid}, {lastLogin: now})
    else Document missing
        WJS->>FS: setDoc(users/{uid}, {uid, name, email, createdAt, lastLogin})
    end
    WJS->>LS: set({synapse_auth_status: true, synapse_auth_user})
    WJS->>WJS: showSuccess()
```

---

## Flow 3: Google OAuth Login

```mermaid
sequenceDiagram
    actor User
    participant WJS as welcome.js / auth.js
    participant FBAuth as Firebase Auth
    participant Google as Google OAuth
    participant FS as Firestore
    participant LS as chrome.storage.local
    participant BG as background.js

    User->>WJS: Clicks 'Continue with Google'
    WJS->>FBAuth: signInWithPopup(auth, GoogleAuthProvider)
    FBAuth->>Google: Opens Google account picker
    Google-->>FBAuth: Account selection + token
    FBAuth-->>WJS: result.user
    WJS->>FS: getDoc(users/{uid})
    alt New user
        WJS->>FS: setDoc(users/{uid}, {name, email, createdAt, lastLogin})
    else Returning user
        WJS->>FS: updateDoc(users/{uid}, {lastLogin})
    end
    WJS->>LS: set({synapse_auth_status: true, synapse_auth_user})
    Note over WJS,BG: Only in welcome.js path
    WJS->>BG: sendMessage({action: "authChange"})
```

**Fallback path (if popup blocked in extension context):**
```mermaid
sequenceDiagram
    participant AuthJS as auth.js (popup context)
    participant BG as background.js

    AuthJS->>FBAuth: signInWithPopup (throws popup-blocked)
    AuthJS->>BG: sendMessage({action: "login"})
    BG->>FBAuth: signInWithPopup(auth, provider)
    FBAuth-->>BG: result.user
    BG->>FS: Create/update users/{uid}
    BG-->>AuthJS: {success: true}
```

---

## Flow 4: Password Reset (Forgot Password)

```mermaid
sequenceDiagram
    actor User
    participant AUI as auth-ui.js
    participant AuthJS as auth.js
    participant FBAuth as Firebase Auth

    User->>AUI: Clicks 'Forgot?' link (login screen)
    AUI->>AUI: Read email from authEmail input
    AUI->>AuthJS: resetPassword(email)
    AuthJS->>FBAuth: sendPasswordResetEmail(auth, email)
    FBAuth-->>User: Password reset email sent
    AUI->>AUI: Show success message in authError element
```

---

## Flow 5: Password Change (Security Screen)

```mermaid
sequenceDiagram
    actor User
    participant AUI as auth-ui.js
    participant SEC as security.js
    participant FBAuth as Firebase Auth

    User->>AUI: Opens Security screen
    Note over AUI: Google users see info message,<br/>form is hidden (provider check)
    User->>AUI: Enters currentPassword, newPassword, confirmPassword
    AUI->>AUI: Client-side check: newPassword === confirmPassword
    AUI->>SEC: changePassword(currentPassword, newPassword)
    SEC->>SEC: Check: user.providerData has google.com?
    alt Google user
        SEC-->>AUI: throw Error("Password changes must be managed through Google.")
    else Email user
        SEC->>FBAuth: EmailAuthProvider.credential(email, currentPassword)
        SEC->>FBAuth: reauthenticateWithCredential(user, credential)
        FBAuth-->>SEC: Re-auth success
        SEC->>FBAuth: updatePassword(user, newPassword)
        FBAuth-->>SEC: Success
        SEC-->>AUI: void (no error)
        AUI->>AUI: Show success message
    end
```

---

## Flow 6: Logout

```mermaid
sequenceDiagram
    actor User
    participant AUI as auth-ui.js
    participant AuthJS as auth.js
    participant FBAuth as Firebase Auth
    participant LS as chrome.storage.local

    User->>AUI: Clicks 'Logout' in dropdown
    AUI->>LS: set({synapse_auth_status: false, synapse_auth_user: null})
    AUI->>AuthJS: logoutUser()
    AuthJS->>FBAuth: auth.signOut()
    AUI->>AUI: profileDropdown.classList.remove('show')
    AUI->>chrome.tabs: create({url: welcome.html})
    AUI->>AUI: window.close() — popup closes
```

---

## Flow 7: External Auth Bridge (synapse-ai.app)

```mermaid
sequenceDiagram
    participant Website as synapse-ai.app
    participant BG as background.js
    participant LS as chrome.storage.local
    participant Popup as popup (if open)

    Website->>BG: chrome.runtime.sendMessage(extensionId, {action: "externalAuth", user})
    Note over Website,BG: Only allowed from https://synapse-ai.app/*<br/>per manifest.json externally_connectable
    BG->>LS: set({synapse_auth_status: true, synapse_auth_user: request.user})
    BG->>Popup: chrome.runtime.sendMessage({action: "authChange", user})
    BG-->>Website: {success: true}
    LS-->>Popup: storage.onChanged fires
    Popup->>Popup: showScreen('dashboard')
```

---

## Session Management

### Token Handling

Firebase Auth manages token refresh automatically via the Firebase Auth SDK. The extension does **not** manually handle JWT tokens. Token state is maintained by the Firebase SDK internally using IndexedDB persistence.

### Auth State in Extension Storage

The boolean flag `synapse_auth_status` in `chrome.storage.local` acts as a **lightweight auth gate** for content scripts and popup routing. It is NOT a security token — it is a UI hint.

**Important:** Firebase Auth token validity is enforced at the Firebase SDK level for all Firestore and Auth API calls. The local storage flag only controls UI visibility.

### Cross-Context Auth Sync

```mermaid
graph LR
    FBAuth["Firebase Auth SDK\n(onAuthStateChanged)"] -->|"storage.set"| LS["chrome.storage.local\nsynapse_auth_status"]
    LS -->|"storage.onChanged"| CS["content.js\nshow/hide button"]
    LS -->|"storage.onChanged"| AUI["auth-ui.js\nscreen routing"]
    WJS["welcome.js\nsyncAuthWithExtension()"] -->|"storage.set"| LS
    BG["background.js\nexternalAuth handler"] -->|"storage.set"| LS
```

### Service Worker Cold Start

Background.js `getCurrentUserAsync()` handles the case where the service worker restarts and Firebase Auth has not yet restored from IndexedDB:

```javascript
function getCurrentUserAsync() {
    return new Promise((resolve) => {
        if (auth.currentUser) {
            resolve(auth.currentUser);  // Already available
            return;
        }
        // Wait for onAuthStateChanged to fire after IndexedDB restore
        const unsubscribe = auth.onAuthStateChanged((user) => {
            unsubscribe();
            resolve(user);
        });
        // Hard timeout: resolve with whatever is available after 1 second
        setTimeout(() => {
            resolve(auth.currentUser);
        }, 1000);
    });
}
```

---

## Security Notes (From Code Analysis)

| Finding | Location | Impact |
|---|---|---|
| Groq API key hardcoded in source | `background.js` line 22, `content.js` line 4 | High — key visible to any user inspecting extension via `chrome://extensions` |
| Firebase config hardcoded | `popup/firebase.js` | Medium-Low — standard for client Firebase; security depends on Firestore Security Rules |
| Firestore Security Rules not present in repo | Not found in codebase | High — data access enforced at application level only via `owner_uid` field filtering |
| External auth bypass via `externalAuth` | `background.js` | Medium — any page at `synapse-ai.app/*` can set auth status without Firebase token validation |
| Provider check in security.js prevents Google users from changing password via email form | `popup/security.js` | Good — prevents cross-provider auth confusion |
| Reauthentication required before password change | `popup/security.js` | Good — mitigates account takeover via unattended session |
