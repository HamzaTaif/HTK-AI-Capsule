# .kiro — Synapse AI Link Project Documentation

> This folder was designed and structured by **Kiro** as the complete project intelligence layer for Synapse AI Link — a Chrome Extension that bridges AI context across ChatGPT, Claude, Gemini, and Perplexity.

---

## What This Folder Contains

The `.kiro` folder is the single source of truth for how this project was designed, built, and should evolve. It contains three layers:

```
.kiro/
│
├── README.md                          ← You are here
│
├── steering/                          ← Always-on project context for Kiro
│   ├── project-overview.md            ← Tech stack, structure, key concepts, critical rules
│   ├── coding-standards.md            ← JS style, naming conventions, patterns, design tokens
│   └── architecture-decisions.md      ← 10 ADRs explaining every major technical decision
│
├── specs/                             ← Feature specs (requirements → design → tasks)
│   ├── capsule-memory-engine/         ← Core feature: capture, store, inject AI memory
│   │   ├── requirements.md
│   │   ├── design.md
│   │   └── tasks.md
│   ├── authentication/                ← Firebase Auth: email, Google OAuth, sessions
│   │   ├── requirements.md
│   │   ├── design.md
│   │   └── tasks.md
│   ├── document-vault/                ← PDF/DOCX upload, AI extraction, cloud sync
│   │   ├── requirements.md
│   │   ├── design.md
│   │   └── tasks.md
│   └── popup-dashboard/               ← 8-screen SPA popup, stats, capsule list
│       ├── requirements.md
│       ├── design.md
│       └── tasks.md
│
├── hooks/                             ← Automated Kiro agent hooks
│   ├── manifest-guard.json            ← Guards manifest.json changes
│   ├── lint-on-save.json              ← Checks Chrome Extension JS patterns on every save
│   ├── new-platform-adapter-check.json ← Validates completeness when content.js is edited
│   └── firestore-write-review.json    ← Reviews Firestore write patterns before file edits
│
└── docs/                              ← Reference documentation
    ├── architecture.md                ← Full architecture diagram + component boundaries
    ├── authentication.md              ← All 7 auth flows with Mermaid diagrams
    ├── components.md                  ← Every component: purpose, functions, dependencies
    ├── data-flow.md                   ← 7 end-to-end data flow diagrams
    ├── deployment.md                  ← Extension packaging, Firebase config, CWS checklist
    ├── hackathon-presentation.md      ← Judge-ready overview, demo script, scoring
    ├── requirements.md                ← 55 formal requirements (REQ-001 to REQ-055)
    ├── roadmap.md                     ← v1.1 / v2.0 / v3.0 roadmap with code evidence
    ├── storage.md                     ← Complete Firestore + local storage schema
    └── system-design.md               ← Goals, constraints, modules, design decisions
```

---

## Steering Files

Steering files are automatically included in every Kiro session. They tell Kiro everything it needs to know about the project before touching any code.

| File | Purpose |
|---|---|
| `project-overview.md` | The big picture — what this is, the tech stack, file structure, and 5 critical rules |
| `coding-standards.md` | How to write code in this project — style, patterns, naming, design tokens |
| `architecture-decisions.md` | 10 ADRs explaining WHY decisions were made — prevents regressions |

---

## Specs

Each spec covers one major feature area with three documents:

| Document | Purpose |
|---|---|
| `requirements.md` | User stories with formal acceptance criteria |
| `design.md` | Architecture diagrams, data schemas, algorithm details |
| `tasks.md` | Implementation checklist — completed (v1.0) and pending (v1.1) |

### Feature Specs

| Spec | What It Covers |
|---|---|
| `capsule-memory-engine` | DOM scraping, Groq capsule generation, Firestore dual-write, `@CAP-*` injection, fact scanner |
| `authentication` | Email/password, Google OAuth, welcome.html portal, cross-context auth sync, password management |
| `document-vault` | PDF/DOCX in-browser parsing, Groq summarization, compression, vault UI |
| `popup-dashboard` | 8-screen SPA, project stats, capsule list, real-time status badge |

---

## Hooks

Hooks run automatically during development to catch issues early.

| Hook | Trigger | What It Checks |
|---|---|---|
| `manifest-guard` | `manifest.json` edited | Critical extension fields still intact |
| `lint-on-save` | Any `.js` file saved | CDN imports, module syntax in content.js, chrome API patterns |
| `new-platform-adapter-check` | `content.js` edited | New platforms have both adapter + DOM extractor |
| `firestore-write-review` | Before any file write | Merge strategy, dual-write, error logging format |

---

## Quick Reference

### Key Files
- **`background.js`** — Service worker. All Firestore writes. All message handling.
- **`content.js`** — Content script. DOM scraping, capsule generation, injection, fact scanner.
- **`popup/popup.js`** — Popup controller. Vault manager, dashboard, capsule list.
- **`popup/auth-ui.js`** — All 8 screens + every auth form event handler.
- **`popup/firebase.js`** — Firebase SDK init. Import everything from here — not from libs directly.

### Critical Rules (from steering)
1. Never import Firebase from CDN — use `libs/firebase/` local copies
2. `chrome.storage.local` first, Firestore second (local-first reads)
3. Capsule saves write to BOTH flat collection AND project subcollection
4. Use `getCurrentUserAsync()` — never `auth.currentUser` directly in service worker
5. Each LLM platform needs its own DOM adapter — no generic one-size-fits-all injection

### Capsule Key Format
```
@CAP-PROJECTNAME   (e.g., @CAP-FLUTTER-APP, @CAP-EMBEDDED-SYSTEM)
```

### Chrome Storage Keys
```
synapse_auth_status    → boolean
synapse_auth_user      → {uid, email, name}
capsules               → CapsuleObject[]
synapse_vault          → VaultDocument[]
synapse_intercepted    → {[url]: DocumentObject[]}
```

---

## Project At a Glance

**Synapse AI Link** — Chrome Extension that captures AI conversation memory as structured "capsules" and injects them into any supported LLM via `@CAP-KEY` syntax.

- **Stack:** Chrome MV3 · Firebase Auth + Firestore · Groq `llama-3.1-8b-instant` · PDF.js · Mammoth.js · Vanilla JS
- **Platforms:** ChatGPT · Claude · Gemini · Perplexity
- **Author:** Hamza Taif (HTK)
- **Version:** 1.0
