# Data Flow — Synapse AI Link

> All flows verified from actual code. No assumed behavior documented.

---

## Overview

Data in Synapse AI Link flows through five primary paths:

1. **Capsule Generation** — Conversation → Groq → Firestore + Local Storage
2. **Capsule Injection** — `@CAP-KEY` → Local/Firestore lookup → LLM input
3. **Authentication** — User credentials → Firebase Auth → Extension storage
4. **Document Vault** — File upload → In-browser parse → Groq → Firestore
5. **Dashboard Sync** — Firestore read → Local storage → Popup UI

---

## Flow 1: Capsule Generation

```mermaid
sequenceDiagram
    actor User
    participant DOM as LLM Page DOM
    participant CS as content.js
    participant LS as chrome.storage.local
    participant BG as background.js
    participant Groq as Groq API<br/>(llama-3.1-8b-instant)
    participant FS as Cloud Firestore

    User->>CS: Clicks ◉ Synapse button
    CS->>CS: checkAndInjectButton() confirms auth
    CS->>DOM: extractRecentMessages()
    Note over CS,DOM: Platform-specific selectors<br/>ChatGPT / Claude / Gemini / Perplexity
    DOM-->>CS: messages[] (role + content pairs)
    CS->>DOM: detectAttachmentsInElement()
    DOM-->>CS: attachments[] (filenames)
    CS->>CS: generateSmartTitle(messages)
    Note over CS: Page title → first user message<br/>→ empty string fallback
    CS->>CS: validateProjectName(title)
    CS->>Groq: POST /openai/v1/chat/completions<br/>model: llama-3.1-8b-instant<br/>conversation turns + document list
    Note over CS,Groq: temperature: 0.2, max_tokens: 800<br/>Prompt requests structured JSON capsule
    alt Groq succeeds
        Groq-->>CS: Raw JSON text
        CS->>CS: Parse + validate capsule JSON
    else Groq fails
        CS->>CS: generateCapsuleLocally(messages)
        Note over CS: Heuristic-only fallback<br/>No Groq call
    end
    CS->>CS: Assign key = @CAP-PROJECTNAME
    CS->>BG: sendMessage({action: "saveCapsule", capsule})
    BG->>BG: getCurrentUserAsync()
    Note over BG: 1s timeout fallback for cold starts
    BG->>FS: setDoc(capsules/{capsule.id})
    BG->>FS: setDoc(memory/{uid}, {merge: true})<br/>allTopics, allConcepts, sessionCount++
    BG->>FS: setDoc(users/{uid}/projects/{pid})
    BG->>FS: setDoc(.../capsules/{capsule.id})
    BG->>FS: setDoc(.../facts/{factId}) × N
    BG->>FS: setDoc(.../decisions/{decId}) × N
    BG->>FS: setDoc(.../state/current)
    BG->>LS: get([synapse_vault, synapse_intercepted])
    LS-->>BG: local vault + intercepted docs
    BG->>FS: setDoc(.../documents/{docId}) × N
    BG-->>CS: {success: true}
    CS->>CS: pulse-success animation on button
    CS->>LS: (capsule already written via popup sync)
```

---

## Flow 2: Capsule Injection

```mermaid
sequenceDiagram
    actor User
    participant DOM as LLM Input Field
    participant CS as content.js
    participant LS as chrome.storage.local
    participant BG as background.js
    participant FS as Cloud Firestore

    User->>DOM: Types @CAP-FLUTTER in input
    User->>DOM: Presses Enter
    CS->>CS: keydown event intercepted
    CS->>CS: regex: /\\@CAP-[A-Z0-9_-]+/i detected
    CS->>LS: chrome.storage.local.get(['capsules'])
    alt Capsule found in local storage
        LS-->>CS: capsule object
    else Not found locally
        CS->>BG: sendMessage({action: "resolveCapsule", key: "@CAP-FLUTTER"})
        BG->>FS: query(capsules, where("key", "==", "@CAP-FLUTTER"))
        FS-->>BG: capsule document
        BG-->>CS: {success: true, capsule}
    end
    CS->>CS: Reconstruct memory prompt from capsule fields
    Note over CS: Builds human-readable context string:<br/>project, purpose, current step,<br/>facts, decisions, documents
    CS->>DOM: PlatformAdapter.inject(contextPrompt)
    Note over CS,DOM: ChatGPT: React value setter<br/>Claude: execCommand('insertText')<br/>Gemini: ClipboardEvent paste<br/>Perplexity: textarea.value setter
    CS->>DOM: PlatformAdapter.getSendButton().click()
    DOM-->>User: Context submitted to LLM
```

---

## Flow 3: Authentication (Email/Password)

```mermaid
sequenceDiagram
    actor User
    participant Popup as popup.html
    participant AuthUI as auth-ui.js
    participant AuthJS as auth.js
    participant FBAuth as Firebase Auth
    participant FS as Cloud Firestore
    participant LS as chrome.storage.local
    participant BG as background.js

    User->>Popup: Opens popup (not authenticated)
    Popup->>LS: get(['synapse_auth_status'])
    LS-->>Popup: false
    Popup->>AuthUI: showScreen('auth')
    User->>Popup: Clicks 'Sign In on Website'
    Popup->>BG: chrome.tabs.create({url: welcome.html})
    Note over Popup: Popup closes

    User->>FBAuth: Enters email + password in welcome.html
    FBAuth-->>User: userCredential
    User->>FS: updateDoc(users/{uid}, {lastLogin})
    User->>LS: set({synapse_auth_status: true, synapse_auth_user})
    User->>BG: sendMessage({action: "authChange"})
    
    User->>Popup: Opens popup again
    Popup->>LS: get(['synapse_auth_status'])
    LS-->>Popup: true
    Popup->>AuthUI: showScreen('dashboard')
    AuthUI->>FS: getDoc(users/{uid})
    FS-->>AuthUI: profile data
    AuthUI->>Popup: Render avatar, name, email
    AuthUI->>Popup: onAuthSuccess callback → loadCapsules()
```

---

## Flow 4: Authentication (Google OAuth)

```mermaid
sequenceDiagram
    actor User
    participant Welcome as welcome.html
    participant WJS as welcome.js
    participant FBAuth as Firebase Auth<br/>(Google)
    participant FS as Cloud Firestore
    participant LS as chrome.storage.local
    participant BG as background.js

    User->>Welcome: Clicks 'Continue with Google'
    WJS->>FBAuth: signInWithPopup(auth, GoogleAuthProvider)
    Note over WJS,FBAuth: Google account picker shown
    FBAuth-->>WJS: result.user (uid, displayName, email, photoURL)
    WJS->>FS: getDoc(users/{uid})
    alt First time user
        WJS->>FS: setDoc(users/{uid}, {name, email, createdAt, lastLogin})
    else Returning user
        WJS->>FS: updateDoc(users/{uid}, {lastLogin})
    end
    WJS->>LS: set({synapse_auth_status: true, synapse_auth_user})
    WJS->>BG: sendMessage({action: "authChange", user})
    WJS->>Welcome: showSuccess() — auth section hidden
    User->>Welcome: Clicks 'Close Tab'
    Welcome->>Welcome: window.close()
```

---

## Flow 5: Document Vault Upload

```mermaid
sequenceDiagram
    actor User
    participant Popup as popup.js
    participant PDFjs as pdf.min.js<br/>(in-browser)
    participant Mammoth as mammoth.min.js<br/>(in-browser)
    participant LS as chrome.storage.local
    participant BG as background.js
    participant Groq as Groq API
    participant FS as Cloud Firestore

    User->>Popup: Drops file onto vault dropzone
    Popup->>Popup: processVaultFiles(files)
    
    alt PDF file
        Popup->>PDFjs: Load libs/pdf.min.js (lazy)
        PDFjs-->>Popup: pdfjsLib available
        Popup->>PDFjs: getDocument(arrayBuffer)
        PDFjs-->>Popup: Raw text from all pages
    else DOCX / DOC file
        Popup->>Mammoth: Load libs/mammoth.min.js (lazy)
        Mammoth-->>Popup: extractRawText(arrayBuffer)
        Mammoth-->>Popup: Raw text string
    else TXT / PPTX file
        Popup->>Popup: FileReader.readAsText()
    end
    
    Popup->>Popup: compressTextLocally(rawText, maxChars)
    Note over Popup: head (60%) + [compressed] + tail (40%)
    Popup->>LS: Update synapse_vault array with new doc
    Popup->>BG: sendMessage({action: "processPDF", text, filename})
    BG->>Groq: POST /chat/completions<br/>text.slice(0, 8000)<br/>model: llama-3.1-8b-instant
    Note over BG,Groq: Extracts: summary, concepts[], facts[]
    Groq-->>BG: {summary, concepts[], facts[]}
    BG->>FS: setDoc(documents/{docId}, finalDoc)
    alt User authenticated
        BG->>FS: setDoc(users/{uid}/projects/{pid}/documents/{docId})
    end
    BG-->>Popup: {success: true, doc}
    Popup->>Popup: renderVault() — UI updated with status badge
```

---

## Flow 6: Popup Dashboard Sync

```mermaid
sequenceDiagram
    participant Popup as popup.js
    participant LS as chrome.storage.local
    participant BG as background.js
    participant FS as Cloud Firestore

    Popup->>LS: get([synapse_auth_status, synapse_auth_user])
    alt Not authenticated
        Popup->>Popup: showScreen('auth')
    else Authenticated
        Popup->>BG: sendMessage({action: "syncCapsules"})
        BG->>FS: query(capsules, where("owner_uid", "==", uid))
        FS-->>BG: capsules[]
        BG-->>Popup: {success: true, capsules[]}
        Popup->>LS: Merge cloud capsules into local capsules[]
        Popup->>BG: sendMessage({action: "loadProjectMemory"})
        BG->>FS: getDoc(users/{uid}/projects/{pid})
        BG->>FS: getDocs(.../facts)
        BG->>FS: getDocs(.../decisions)
        BG->>FS: getDoc(.../state/current)
        BG->>FS: getDocs(.../documents)
        BG->>FS: getDocs(.../images)
        FS-->>BG: All subcollection data
        BG-->>Popup: {success: true, project, facts, decisions, state, documents}
        Popup->>Popup: loadDashboard() — render stats + recent projects
        Popup->>Popup: renderVault() — render vault file list
    end
```

---

## Flow 7: Background Fact Scanner

```mermaid
sequenceDiagram
    participant Interval as setInterval (30s)
    participant CS as content.js Fact Scanner
    participant DOM as Page DOM
    participant LS as chrome.storage.local

    Note over Interval: Runs every 30,000ms
    Interval->>CS: Tick
    CS->>DOM: extractRecentMessages()
    DOM-->>CS: messages[]
    CS->>CS: Apply regex patterns for 6 fact categories:
    Note over CS: hardware_configuration<br/>code_detail<br/>system_configuration<br/>user_decision<br/>system_state<br/>study_fact
    CS->>CS: Deduplicate against previously stored facts
    CS->>LS: get([facts keyed by window.location.href])
    LS-->>CS: existing facts[]
    CS->>CS: Merge new facts, remove duplicates
    CS->>LS: set({[url]: mergedFacts[]})
```

---

## Data Transformation: Raw Conversation → Capsule JSON

```mermaid
flowchart TD
    A["Raw DOM HTML\n(LLM conversation page)"] -->|"getCleanText()\nremoves SVG, buttons, scripts"| B["Cleaned Text Strings"]
    B -->|"extractRecentMessages()\nplatform-specific selectors"| C["messages[]\n{role: 'user'|'assistant', content: string}"]
    C -->|"deduplication by first 50 chars"| D["Unique Messages[]"]
    D -->|"generateSmartTitle()\npage title → first user message"| E["projectTitle string"]
    D -->|"detectAttachmentsInElement()\nfile card selectors"| F["attachments[]\n{filename, type}"]
    D & E & F -->|"Groq API prompt\nllama-3.1-8b-instant"| G["Raw JSON string\nfrom LLM"]
    G -->|"JSON.parse()\n+ field validation"| H["Capsule Object\n{layer1, layer2, layer3, layer4,\ndocument_summary, user_preferences}"]
    H -->|"Add: id, key, owner_uid,\ncreatedAt"| I["Final Capsule\nReady for Storage"]
    I -->|"background.js saveCapsule\n10x Firestore writes"| J["Firestore\n(flat + nested)"]
    I -->|"chrome.storage.local"| K["Local Cache"]
```
