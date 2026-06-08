---
inclusion: always
---

# Coding Standards — Synapse AI Link

## JavaScript Style

- **ES2020+ features** are used throughout — async/await, optional chaining (`?.`), nullish coalescing (`??`)
- **No TypeScript** — plain JavaScript throughout the project
- **No bundler** — files run directly in Chrome without transpilation
- **ES Module imports** (`import`/`export`) used in all popup files and background.js
- **`var` declarations** used in content.js (non-module context) — do not change to `let`/`const` in content.js without testing
- **jshint esversion: 8** comment present in popup.js — respect this

## Naming Conventions

- Functions: `camelCase` — e.g., `loadCapsules()`, `generateSmartTitle()`
- Constants: `SCREAMING_SNAKE_CASE` — e.g., `GROQ_API_KEY`
- DOM IDs: `camelCase` — e.g., `#capsuleList`, `#vaultDropZone`
- CSS classes: `kebab-case` — e.g., `.synapse-input-btn`, `.capsule-item`
- Firestore collection names: `camelCase` — e.g., `capsules`, `synapse_vault`
- Chrome storage keys: `snake_case` with `synapse_` prefix — e.g., `synapse_auth_status`

## Error Handling Patterns

Always wrap Firestore operations with try/catch and use the project's error logging pattern:

```javascript
try {
    await setDoc(docRef, data);
} catch (error) {
    console.error("Firestore failure at background.js -> functionName:", error);
    sendResponse({ success: false, error: error.message });
}
```

For warnings (non-critical):
```javascript
console.warn("Firestore warning at background.js -> saveCapsule (reason):", e);
```

## Chrome Storage Wrappers

Always use the safe wrappers — do NOT call `chrome.storage.local` directly:

```javascript
// In popup.js
function safeStorageGet(keys, callback) { 
    chrome.storage.local.get(keys, callback); 
}
function safeStorageSet(data, callback) { 
    chrome.storage.local.set(data, callback); 
}

// In content.js
function safeStorageGet(keys, callback) {
    try {
        if (!chrome?.runtime?.id || !chrome?.storage?.local) {
            callback({});
            return;
        }
        chrome.storage.local.get(keys, callback);
    } catch (e) {
        callback({});
    }
}
```

## Async Message Passing

All `chrome.runtime.onMessage` handlers that perform async operations MUST return `true`:

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "myAction") {
        someAsyncFunction().then(result => {
            sendResponse({ success: true, data: result });
        });
        return true; // REQUIRED for async response
    }
});
```

## Firestore Write Pattern

For project subcollection writes, use `{ merge: true }` to avoid overwriting existing fields:

```javascript
await setDoc(docRef, newData, { merge: true });
```

Only use plain `setDoc` (no merge) for flat collection writes where full replacement is intended.

## Text Safety

All user-supplied text displayed in HTML must be sanitized using `safeAttr()`:

```javascript
function safeAttr(str) {
    return (str || "").toString()
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
```

## UI Design Tokens

Always use CSS variables — never hardcode colors:

```css
--primary: #00ffcc
--secondary: #0099ff
--bg: #0d0d15
--card-bg: rgba(255, 255, 255, 0.05)
--border: rgba(255, 255, 255, 0.08)
--text: #f3f4f6
--text-muted: #9ca3af
--error: #f43f5e
--success: #10b981
--font: 'Outfit', sans-serif
```

## Content Script Rules

- All injected CSS must be scoped with `.synapse-` prefix to avoid conflicts with LLM page styles
- All injected elements must use `!important` on style properties to override LLM platform styles
- Always check `isChromeContextValid()` before any `chrome.*` API call in content.js
- The Synapse button ID is `#synapse-input-btn` — never change this; other parts of the code reference it
