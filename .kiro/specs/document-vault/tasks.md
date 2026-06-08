# Tasks — Document Vault

## Implementation Status

All tasks in this spec are **COMPLETED** as of v1.0.

---

## Task List

- [x] **Task 1** — Implement vault file input and dropzone
  - [x] `#vaultDropZone` drag-over + drop event listeners
  - [x] `#vaultFileInput` change event listener
  - [x] Accept attribute: `.pdf,.docx,.doc,.pptx,.ppt,.txt`
  - [x] Multiple file selection enabled

- [x] **Task 2** — Implement `processVaultFiles(files)` orchestrator
  - [x] Iterate over file list
  - [x] Route to correct extractor based on file extension
  - [x] Call `compressTextLocally(rawText, maxChars)`
  - [x] Build vault document object with all required fields
  - [x] Save to `chrome.storage.local` → `synapse_vault` array
  - [x] Send `processPDF` message to background.js
  - [x] Update UI on completion via `renderVault()`

- [x] **Task 3** — Implement PDF extraction (PDF.js)
  - [x] Lazy-load `libs/pdf.min.js` via `chrome.runtime.getURL`
  - [x] Load `pdf.worker.min.js` as worker source
  - [x] Call `pdfjsLib.getDocument(arrayBuffer)`
  - [x] Iterate pages and call `page.getTextContent()`
  - [x] Join all page text items

- [x] **Task 4** — Implement DOCX extraction (Mammoth.js)
  - [x] Lazy-load `libs/mammoth.min.js` via `chrome.runtime.getURL`
  - [x] Call `mammoth.extractRawText({arrayBuffer})`
  - [x] Return `.value` string

- [x] **Task 5** — Implement TXT/PPTX extraction
  - [x] `FileReader.readAsText(file)` for plain text

- [x] **Task 6** — Implement `compressTextLocally(raw, maxChars)`
  - [x] Normalize whitespace
  - [x] Return raw if within limit
  - [x] head(60%) + `\n\n[...compressed...]\n\n` + tail(40%)

- [x] **Task 7** — Implement `background.js → processPDF` handler
  - [x] `getCurrentUserAsync()` for user context
  - [x] Call `summarizeAndExtractConceptsFromPDF(text, filename)`
  - [x] Build `finalDoc` object with all required fields
  - [x] `setDoc(documents/{docId}, finalDoc)` — flat collection
  - [x] `setDoc(users/{uid}/projects/{pid}/documents/{docId}, finalDoc, {merge:true})` if authenticated

- [x] **Task 8** — Implement `summarizeAndExtractConceptsFromPDF(pdfText, filename)`
  - [x] POST to `https://api.groq.com/openai/v1/chat/completions`
  - [x] Model: `llama-3.1-8b-instant`, temperature: 0.2, max_tokens: 1000
  - [x] Input capped at `pdfText.slice(0, 8000)`
  - [x] Parse JSON response with markdown fence stripping
  - [x] Graceful fallback values if Groq fails

- [x] **Task 9** — Implement `syncVaultWithCloud()` in popup.js
  - [x] Query Firestore `vault` collection
  - [x] Merge with existing `synapse_vault` in local storage
  - [x] No duplicates by document ID

- [x] **Task 10** — Implement `buildVaultItemHTML(docItem)`
  - [x] File type icon selection (PDF/PPTX/DOCX/other)
  - [x] Title truncation at 24 characters
  - [x] Status badge: green/orange based on `status` and `charCount`

- [x] **Task 11** — Implement `showDocumentSelector()` modal
  - [x] List all `vaultDocs` with checkboxes
  - [x] Confirm selection → pass selected docs to capsule generator

---

## V1.1 Pending Tasks

- [ ] **Task 12** — Add vault document deletion
  - Allow users to remove documents from vault
  - Must delete from `chrome.storage.local` AND `documents/{docId}` in Firestore

- [ ] **Task 13** — Add vault document re-processing
  - Allow re-running Groq summarization on an existing document
  - Useful if original processing failed or model improves
