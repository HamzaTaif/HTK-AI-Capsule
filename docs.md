# 🌌 Synapse AI Link — Developer & User Guide

Welcome to the **Synapse AI Link** documentation. This extension connects and links conversation contexts across **ChatGPT**, **Claude AI**, **Gemini**, and **Perplexity** natively and seamlessly.

> [!NOTE]
> This guide is written in plain, non-technical terms to help you understand exactly what the code does, even if you are not a programmer.

---

## 🚀 1. The Core Vision: Synapse AI Link

To prevent market collision and offer a brand that represents connecting thoughts/LLMs, this extension has been renamed from *HTK Capsule* to **Synapse AI Link**.

Instead of having a floating orb in the bottom-right corner, **Synapse AI Link** injects its trigger button **directly inside the LLM input bar**, right next to the native voice/microphone icon. It looks like a native, organic button of the website!

```
[ChatGPT / Claude / Gemini / Perplexity Chat Input]
┌─────────────────────────────────────────────────────────────┐
│  +  Ask anything...                          🎙️  ◉  ⬆️      │
└─────────────────────────────────────────────────────▲───────┘
                                                      │
                                             Synapse Icon
```

---

## 🎨 2. The Sleek Popover Library UI

When you click the Synapse icon (`◉`), a gorgeous glassmorphic popover card appears directly above the input bar button. Unlike a simple text field, this popup acts as your local **Synapse Library**:

1.  **Generate Memory**: Enter a title (automatically pre-filled based on the thread context) and click **Generate** to save the active chat into the extension's local storage.
2.  **Synapse Library**: A scrollable panel displaying all your saved synapses. Each saved session is complete with its own grab handles and details.
3.  **Click to Drop**: Click the neon-cyan **Drop** button next to any capsule in the list to automatically inject its key and submit the chat.
4.  **Drag & Drop**: Grab any synapse directly from the library list, drag it over, and drop it into the chat textbox!

---

## ✨ 3. Micro-Animations & Toast Notifications

We built eye-catching micro-interactions and a custom toast notification engine to make the extension feel premium, responsive, and alive:

*   **Generate Animation (Rise & Spin)**: When you click **Generate**, the popover closes, and the Synapse button translates upward by `12px` and performs a `360-degree spin` while glowing with a neon cyan drop shadow. Once saved, it returns to its place.
*   **Success Confirmation (Green Flash)**: After the animation finishes, the button scales up and flashes emerald green (`#00c896`) for `600ms` to confirm that the session has been saved in memory.
*   **Drop Confirmation (Green Flash)**: When you click/drag-drop a capsule key, the button flashes green to verify the key has successfully registered.
*   **Empty State Warnings (No-Messages Popup)**: If you attempt to click **Generate on an empty chat room**, the extension intercepts it and pops up a custom glassmorphic warning banner: *“No messages detected, so no Synapse context was generated.”* This prevents the creation of blank/useless capsules.
*   **Toast Notifications**: Synapse AI Link bypasses standard web alert dialogs and uses dark, custom-drawn floating banners at the top-right corner to show successes and warnings.

---

## 🛡️ 4. PDF & Document Memory Engine (Cross-LLM Persistent Document Memory)

When you are working with technical documents, research papers, educational textbooks (like Discrete Structures, Calculus, etc.), or slide decks in a session, **Synapse AI Link** ensures that the AI's understanding of those files is preserved across different host LLMs.

### 🔍 1. Attachment Detection & Metadata Extraction
During capsule generation, the extension scans the active chat workspace for:
*   PDF uploads
*   Word documents (`.docx`)
*   Plain text papers (`.txt`, `.md`)
*   Code modules (`.py`, `.js`, `.json`)
*   Presentation slides and spreadsheet references

It identifies their filenames, extensions, and extracts any code or text previews exposed inside the chat card.

### 🧠 2. Semantic Document Context Reconstruction (No Automatic File Opening)
To keep the extension lightning-fast and secure, it **never** triggers native browser PDF downloads or opens files automatically in the background. Instead, it uses **Semantic Compressed Memory**:
1.  **Surrounding Message Context Analysis**: The engine parses the conversation history (both your queries and the AI's answers) to extract references to the document.
2.  **Topic Extraction**: It maps technical keywords (e.g. *subsets, combinatorics, graph theory, database schemas, greedy algorithms*) discussed in relation to the document.
3.  **Discussion History Tracking**: It compiles previous questions, proof strategies, and code snippets that were discussed under that document's context.

### 🔄 3. Seamless Document Context Restoration
When you click **Drop** or drop a capsule key in a new LLM interface (like Gemini or Claude):
*   The reconstructed prompt informs the new AI about the exact files that were active in the previous session.
*   It lists the important topics, relevant chapters, and previously discussed concepts.
*   **Result**: The target LLM acts and responds as if it has direct knowledge of the uploaded books or PDFs from the start!

*Note: If the new LLM requires physical files for new operations (such as processing high-resolution images or executing local page-range extractions), manually attach the file to the new chat box. The AI will immediately link the physical upload to the restored semantic memory.*

---

## 🔄 5. Invisible Capsule Key Injection & Drag-and-Drop System

To prevent visual clutter and stay within text prompt limits, the extension employs an **Invisible Capsule Key Injection System** paired with native Drag-and-Drop:

### 🔑 1. Tiny Capsule Keys
When you generate a synapse, the extension stores the conversation history in `chrome.storage.local` and creates a short, memorable key:
*   `@CAP-[TITLE]` (e.g. `@CAP-FLUTTER`, `@CAP-SECURITY-SYSTEM`)
*   `◉CAP-[TITLE]`
*   `/capsule [TITLE]`

The key is displayed prominently inside the extension's popup dashboard as a neon-cyan monospace badge.

### 🫳 2. Grab & Drop Interaction
Instead of copying and pasting, you can grab any synapse in the Popover Library list and drag it into the LLM's text input:
1.  **Natively Managed Dragging**: Dragging set data triggers the standard browser drag event.
2.  **State Sync**: Dropping the element into the textbox causes the browser to insert the text natively. This guarantees React, ProseMirror, and draft.js (used in Claude, Gemini, ChatGPT) sync their state immediately without glitches.
3.  **Automatic Detection**: The extension monitors the text area for any of the key patterns. Upon submission (Enter or Send click), the interceptor stops raw submission, swaps the key with the reconstructed context, and submits.
4.  **Combined Prompting**: You can type manual instructions alongside the key, such as:
    `@CAP-FLUTTER Let's build the dashboard view now.`
    The extension will replace `@CAP-FLUTTER` with the reconstructed context and append your new command at the bottom of the prompt automatically!

### 🛠️ 3. Smart Context Reconstruction
Instead of dumping a raw, unformatted transcript, the extension parses the conversation history on-the-fly and generates an optimized prompt containing:
1.  **Session Goals**: Extracted from your previous objectives.
2.  **Key Decisions**: Captured from design choices made in the chat.
3.  **Unresolved State**: Errors, bugs, or fixes encountered.
4.  **Coding Style**: Auto-detected programming languages and styling.
5.  **Verbatim Transcript**: A collapsible dropdown `<details>` element containing the full dialogue so the visible chat log remains completely clean and uncluttered.

---

## 💻 6. How to Load and Test the Extension

1.  Open **Google Chrome** and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** (the toggle switch in the top-right corner).
3.  Click the **Load unpacked** button in the top-left corner.
4.  Select your workspace folder: `HTK-AI-Capsule`.
5.  Open [ChatGPT](https://chatgpt.com), [Claude](https://claude.ai), [Gemini](https://gemini.google.com), or [Perplexity](https://www.perplexity.ai).
6.  Look inside the prompt input box—your new **Synapse AI Link** icon is ready next to the microphone icon!

---

## 🔒 7. Live Cloud Memory Sync & Firebase Authentication

To enable a true cross-device and collaborative context bridge, **Synapse AI Link** has evolved into a **Live Cloud Capsule Resolution Engine** powered by Google Firebase:

*   **Premium Auth Dashboard**: A custom-designed Sign In / Sign Up interface is integrated directly into the popup. It supports classic Email/Password credentials and Google OAuth Sign-in, utilizing the Outfit font and glassmorphic inputs.
*   **Firestore Database Backup**: When authenticated users generate a synapse, the capsule is automatically synced and backed up to a secure Firestore database under the user's `owner_uid`.
*   **Dynamic Cloud Key Resolution**: If you drop or type a capsule key (e.g. `@CAP-ALGORITHMS-5`) that is not saved on your current device, Synapse AI Link intercepts the submission, queries the cloud Firestore database, retrieves the capsule details, dynamically builds the memory context on-the-fly, and injects it into the prompt.
*   **Cache-First Local Sync**: Opening the popup or popover prompts a background synchronization with the cloud, merging your global library into local storage for offline speed and reliability.
*   **Unified Delete Mechanism**: Deleting a capsule via the popup dashboard cleanly removes it from both the local storage cache and the Firestore cloud database in one click.

