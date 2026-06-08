---
inclusion: always
---

# Synapse AI Link — Project Steering

## What This Project Is

Synapse AI Link is a **Chrome Extension (Manifest V3)** that solves AI context loss. It captures structured conversation memory as portable "capsules" and lets users inject that context into any supported AI platform using a `@CAP-KEY` reference.

## Tech Stack

- **Runtime:** Chrome Extension Manifest V3, ES Modules, Vanilla JS
- **Auth & DB:** Firebase Auth (email/password + Google OAuth) + Cloud Firestore
- **AI Inference:** Groq API — model `llama-3.1-8b-instant`
- **Document Parsing:** PDF.js (local), Mammoth.js (local)
- **UI:** Vanilla HTML/CSS, Outfit font (Google Fonts)
- **Firebase SDK:** Bundled locally in `libs/firebase/` — no CDN (Chrome CSP requires this)

## Project Structure

```
manifest.json          ← Extension blueprint (MV3)
background.js          ← Service Worker — message router + Firestore writer
content.js             ← Content Script — injected into 4 LLM sites
welcome.html/js/css    ← Onboarding auth portal
popup/
  popup.html           ← 8-screen SPA popup
  popup.js             ← Vault manager + dashboard controller
  firebase.js          ← Firebase SDK init + exports
  auth.js              ← Firebase Auth wrapper functions
  auth-ui.js           ← Screen router + all form event handlers
  profile.js           ← Firestore profile read/update
  security.js          ← Password change with reauthentication
libs/
  pdf.min.js           ← PDF.js (bundled)
  pdf.worker.min.js    ← PDF.js worker
  mammoth.min.js       ← Mammoth.js (bundled)
  firebase/            ← Firebase SDK local copies
```

## Supported LLM Platforms

- ChatGPT (`chatgpt.com`, `chat.openai.com`)
- Claude (`claude.ai`)
- Gemini (`gemini.google.com`)
- Perplexity (`perplexity.ai`)

## Key Concepts

- **Capsule** — structured JSON memory object with 6 layers (identity, architecture, state, facts, documents, preferences)
- **Capsule Key** — `@CAP-PROJECTNAME` format, typed in any LLM input to inject context
- **Vault** — user's personal document library (PDF, DOCX, PPTX, TXT) with AI-extracted summaries
- **Fact Scanner** — background regex scanner running every 30s, categorizes facts from DOM into 6 types

## Firebase Project

- Project ID: `synapse-ai-99dd0`
- Auth Domain: `synapse-ai-99dd0.firebaseapp.com`
- All SDK files are local copies in `libs/firebase/` — do NOT import from CDN

## Critical Rules

1. **Never import Firebase from CDN** — Chrome Extension CSP blocks it
2. **All message passing uses `chrome.runtime.sendMessage`** — content script → background only
3. **Local storage is always read first** — Firestore is the fallback/sync source
4. **No custom backend server** — zero server-side code; Firebase + Groq handle everything
5. **Platform adapters must handle each LLM separately** — ChatGPT uses React events, Claude uses ProseMirror, Gemini uses ClipboardEvent paste, Perplexity uses native textarea
