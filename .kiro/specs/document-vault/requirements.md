# Requirements — Document Vault

## Overview
The Document Vault lets users store reference documents (PDF, DOCX, PPTX, TXT) that are parsed in-browser, summarized by Groq AI, and attached to capsules. All parsing happens client-side — no file is uploaded to a custom server.

---

## Requirements

### 1 — File Upload

**User Story:** As a user, I want to drag and drop or browse for documents to add them to my vault so that they can be referenced in my AI capsules.

**Acceptance Criteria:**

- 1.1 — The vault accepts `.pdf`, `.docx`, `.doc`, `.pptx`, `.ppt`, `.txt` file types
- 1.2 — Files can be added via drag-and-drop onto `#vaultDropZone` or via file browser (`#vaultFileInput`)
- 1.3 — Multiple files can be uploaded simultaneously
- 1.4 — A status badge shows "processing" during upload and "ready" when complete

### 2 — In-Browser Text Extraction

**User Story:** As a user, I want my documents processed entirely within my browser without uploading them to any external server.

**Acceptance Criteria:**

- 2.1 — PDF files are extracted using `libs/pdf.min.js` (PDF.js) — loaded on demand via `chrome.runtime.getURL`
- 2.2 — DOCX/DOC files are extracted using `libs/mammoth.min.js` (Mammoth.js) — loaded on demand
- 2.3 — TXT files are read directly via `FileReader.readAsText()`
- 2.4 — PPTX files are read as text (best-effort; treated as TXT)
- 2.5 — Extracted text is compressed using `compressTextLocally(raw, maxChars)` before storage (head 60% + tail 40%)
- 2.6 — `charCount` of extracted text is recorded

### 3 — AI-Powered Document Summarization

**User Story:** As a user, I want each uploaded document to be automatically analyzed so I can see what it contains and include relevant facts in my capsules.

**Acceptance Criteria:**

- 3.1 — After text extraction, `sendMessage({action: "processPDF", text, filename})` is sent to background.js
- 3.2 — Background.js calls Groq API with up to 8,000 characters of extracted text
- 3.3 — Groq returns `{summary: string, concepts: string[], facts: string[]}`
- 3.4 — The document is saved to Firestore `documents/{docId}` with `summary`, `concepts`, `facts`, `pageCount`, `charCount`, `compressedText`
- 3.5 — If the user is authenticated, the document is also saved to `users/{uid}/projects/{pid}/documents/{docId}`
- 3.6 — A graceful fallback is used if Groq fails: `summary: "Technical document: {filename}"`, `concepts: ["Document Analysis"]`

### 4 — Vault Local Storage

**User Story:** As a user, I want my vault available instantly when I open the popup without waiting for a cloud sync.

**Acceptance Criteria:**

- 4.1 — All vault documents are stored in `chrome.storage.local` under `synapse_vault` array
- 4.2 — On popup open, `syncVaultWithCloud()` syncs Firestore `vault` collection into local storage
- 4.3 — The vault list is rendered from local storage — `vaultDocs` in-memory array

### 5 — Document Selector for Capsule Generation

**User Story:** As a user, I want to choose which vault documents to include when generating a capsule so that I control what context the AI uses.

**Acceptance Criteria:**

- 5.1 — Before capsule generation, a document selector modal is shown listing all vault files
- 5.2 — User can check/uncheck individual documents
- 5.3 — Selected documents are attached to the capsule's `document_context.documents` array
- 5.4 — Document's `compressedText` is used as the `key_content` in the capsule

### 6 — Vault UI

**User Story:** As a user, I want to see all my vault documents listed with their type, status, and summary in the popup.

**Acceptance Criteria:**

- 6.1 — Each vault item shows an appropriate icon: 📄 PDF, 📊 PPTX, 📝 DOCX, 📎 other
- 6.2 — Each vault item shows a title truncated to 24 characters with ellipsis if longer
- 6.3 — Status badge: green ("ready") when `status === "ready"` or `charCount > 100`, orange ("processing") otherwise
- 6.4 — Vault count badge displays the number of files (e.g., "3 files")
