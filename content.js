console.log("Synapse AI Link: In-context bridge active.");

// Auth state tracking
window.synapseIsAuthenticated = false;
try {
    if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['synapse_auth_status'], (result) => {
            window.synapseIsAuthenticated = !!result.synapse_auth_status;
        });
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.synapse_auth_status !== undefined) {
                window.synapseIsAuthenticated = !!changes.synapse_auth_status.newValue;
                if (!window.synapseIsAuthenticated) {
                    const btn = document.getElementById("synapse-input-btn");
                    if (btn) btn.remove();
                    const popover = document.getElementById("synapse-popover");
                    if (popover) popover.classList.remove('show');
                } else if (typeof checkAndInjectButton === 'function') {
                    checkAndInjectButton();
                }
            }
        });
    }
} catch(e) {
    console.warn("Synapse: Auth sync error", e);
}
function isChromeContextValid() {
    try {
        return !!chrome.runtime?.id;
    } catch (e) {
        return false;
    }
}

function safeStorageGet(keys, callback) {
    try {
        if (!chrome?.runtime?.id || !chrome?.storage?.local) {
            console.warn('Synapse: Cannot access storage, context invalid');
            callback({});
            return;
        }
        chrome.storage.local.get(keys, callback);
    } catch (e) {
        console.warn('Synapse storage error:', e);
        callback({});
    }
}

function safeStorageSet(data, callback) {
    try {
        if (!chrome?.runtime?.id || !chrome?.storage?.local) {
            console.warn('Synapse: Cannot write storage, context invalid');
            return;
        }
        chrome.storage.local.set(data, callback);
    } catch (e) {
        console.warn('Synapse storage write error:', e);
    }
}

async function safeParseError(response) {
    try {
        const text = await response.text();
        if (!text || text.trim() === '') return {};
        return JSON.parse(text);
    } catch (e) {
        return {};
    }
}

const loadingMessages = [
    "Reading your conversation...",
    "Extracting document content...",
    "Building your memory capsule...",
    "Almost done..."
];

function showLoadingAnimation(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return null;

    let index = 0;
    el.textContent = loadingMessages[0];
    el.style.display = 'block';

    const interval = setInterval(() => {
        index = (index + 1) % loadingMessages.length;
        if (el && document.contains(el)) {
            el.textContent = loadingMessages[index];
        } else {
            clearInterval(interval);
        }
    }, 2000);

    return interval;
}

function stopLoadingAnimation(intervalId, elementId, finalMessage) {
    clearInterval(intervalId);
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = finalMessage || 'Done!';
        setTimeout(() => { el.style.display = 'none'; }, 2000);
    }
}


// ==========================================
// 1. INJECT INLINE STYLES FOR SYNAPSE UI
// ==========================================
const styles = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');

/* Injected Synapse Button inside Input Bar */
.synapse-input-btn {
    background: transparent !important;
    border: none !important;
    cursor: pointer !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 6px !important;
    border-radius: 50% !important;
    color: #9ca3af !important;
    transition: all 0.2s ease-in-out !important;
    margin: 0 4px !important;
    width: 32px !important;
    height: 32px !important;
    box-sizing: border-box !important;
    position: relative !important;
    z-index: 99 !important;
    vertical-align: middle !important;
}

/* Match theme colors based on parent hover */
.synapse-input-btn:hover {
    color: #00ffcc !important;
    background: rgba(255, 255, 255, 0.08) !important;
}

/* Generate Rising & Spinning Animation */
.synapse-input-btn.animating {
    animation: synapse-spin 1.2s cubic-bezier(0.25, 0.8, 0.25, 1);
}

@keyframes synapse-spin {
    0% { transform: translateY(0) rotate(0deg); filter: drop-shadow(0 0 0px rgba(0, 255, 204, 0)); }
    40% { transform: translateY(-12px) rotate(180deg); filter: drop-shadow(0 0 8px rgba(0, 255, 204, 0.8)); color: #00ffcc; }
    80% { transform: translateY(2px) rotate(360deg); }
    100% { transform: translateY(0) rotate(360deg); }
}

/* Success Confirmation Pulsing Pulse */
.synapse-input-btn.pulse-success {
    animation: synapse-success 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes synapse-success {
    0% { color: #00c896; transform: scale(1); filter: drop-shadow(0 0 0px rgba(0, 200, 150, 0)); }
    50% { color: #00c896; transform: scale(1.3); filter: drop-shadow(0 0 10px rgba(0, 200, 150, 0.8)); }
    100% { transform: scale(1); }
}

/* Micro Popover Styling */
.synapse-popover {
    position: fixed;
    width: 220px;
    background: rgba(18, 18, 24, 0.94);
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    z-index: 2147483647;
    display: none;
    flex-direction: column;
    gap: 8px;
    font-family: 'Outfit', sans-serif;
    color: #f3f4f6;
    box-sizing: border-box;
}

.synapse-popover.show {
    display: flex;
}

/* Small arrow pointing down */
.synapse-popover::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-width: 6px;
    border-style: solid;
    border-color: rgba(18, 18, 24, 0.94) transparent transparent transparent;
}

.synapse-input-wrapper {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 6px 10px;
    display: flex;
}

.synapse-input-wrapper input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: white;
    font-size: 13px;
    font-family: inherit;
}

.synapse-btn-row {
    display: flex;
    gap: 6px;
}

.synapse-action-btn {
    flex: 1;
    background: linear-gradient(135deg, #00ffcc, #0099ff);
    color: #0c0c14;
    border: none;
    border-radius: 8px;
    padding: 8px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.synapse-action-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 255, 204, 0.35);
}

.synapse-action-btn:active {
    transform: translateY(0);
}

.synapse-action-btn.synapse-btn-secondary {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: white;
}

.synapse-action-btn.synapse-btn-secondary:hover {
    background: rgba(255, 255, 255, 0.12);
    box-shadow: none;
}

/* Popover Library Styles */
.synapse-popover h3 {
    margin: 0 !important;
    font-size: 11px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
    color: #9ca3af !important;
    font-weight: 700 !important;
}

.synapse-list-container {
    max-height: 120px !important;
    overflow-y: auto !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 6px !important;
    margin-top: 4px !important;
}

.synapse-list-container::-webkit-scrollbar {
    width: 4px !important;
}
.synapse-list-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1) !important;
    border-radius: 2px !important;
}

.synapse-list-item {
    background: rgba(255, 255, 255, 0.04) !important;
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
    border-radius: 6px !important;
    padding: 6px 8px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    font-size: 12px !important;
    cursor: grab !important;
    user-select: none !important;
    transition: all 0.2s !important;
}

.synapse-list-item:hover {
    background: rgba(255, 255, 255, 0.08) !important;
    border-color: rgba(0, 255, 204, 0.2) !important;
}

.synapse-list-item:active {
    cursor: grabbing !important;
}

.synapse-item-name {
    font-weight: 500 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    max-width: 140px !important;
}

.synapse-item-actions {
    display: flex !important;
    gap: 4px !important;
}

.synapse-mini-btn {
    background: transparent !important;
    border: none !important;
    cursor: pointer !important;
    font-size: 10px !important;
    font-weight: 600 !important;
    color: #00ffcc !important;
    padding: 2px 6px !important;
    border-radius: 4px !important;
    border: 1px solid rgba(0, 255, 204, 0.2) !important;
    transition: all 0.2s !important;
    font-family: inherit !important;
}

.synapse-mini-btn:hover {
    background: rgba(0, 255, 204, 0.12) !important;
    border-color: #00ffcc !important;
}
`;

if (!document.getElementById("synapse-styles")) {
    const styleEl = document.createElement("style");
    styleEl.id = "synapse-styles";
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
}


// ==========================================
// 2. EXCLUSION STRATEGY FOR ATTACHMENTS (IMGS/PDFs)
// ==========================================
function getCleanText(node) {
    const clone = node.cloneNode(true);

    // Convert file attachments and PDF links to text nodes so filenames are preserved in conversation
    const cardSelectors = [
        '[data-testid="file-attachment-card"]',
        '[class*="attachment"]',
        '[class*="file-card"]',
        '.chat-attachment',
        '.attachment-chip',
        '.uploaded-file',
        'a[href*=".pdf"]',
        'a[download]'
    ];

    try {
        const fileCards = clone.querySelectorAll(cardSelectors.join(','));
        fileCards.forEach(card => {
            const text = card.innerText || "";
            const fileMatch = text.match(/([a-zA-Z0-9_\-\s\.\(\)]+\.([a-zA-Z0-9]{2,5}))/i);
            if (fileMatch) {
                const fname = fileMatch[1].trim();
                const placeholder = document.createTextNode(` [Attached File: ${fname}] `);
                if (card.parentNode) {
                    card.parentNode.replaceChild(placeholder, card);
                }
            }
        });
    } catch (e) {
        console.error("Synapse AI: Error parsing file attachment nodes in clone", e);
    }

    // Explicitly target and strip remaining layout components to keep content clean
    const selectorsToRemove = [
        "button",
        "svg",
        "img",
        "canvas",
        "video",
        "audio",
        "iframe",
        "object",
        "embed",
        "[role='button']",
        ".sr-only",
        ".feedback-buttons",
        "style",
        "script",
        "[aria-label*='Copy']",
        "[aria-label*='Share']",
        ".copy-button",
        ".markdown-attachments"
    ];

    selectorsToRemove.forEach(sel => {
        clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    return clone.innerText.trim();
}

function getPlatformName() {
    const host = window.location.hostname;
    if (host.includes("chatgpt.com") || host.includes("openai.com")) return "chatgpt";
    if (host.includes("claude.ai")) return "claude";
    if (host.includes("gemini.google.com")) return "gemini";
    if (host.includes("perplexity.ai")) return "perplexity";
    return "unknown";
}


// ==========================================
// 3. MULTI-SITE DOM CONVERSATION SCRAPERS
// ==========================================
function extractChatGPT() {
    const turns = [];
    const articles = document.querySelectorAll("article");
    articles.forEach(article => {
        const userElem = article.querySelector("[data-message-author-role='user']");
        const assistantElem = article.querySelector("[data-message-author-role='assistant']");

        if (userElem) {
            turns.push({ role: "user", text: getCleanText(userElem) });
        } else if (assistantElem) {
            turns.push({ role: "assistant", text: getCleanText(assistantElem) });
        } else {
            const isUser = article.querySelector(".whitespace-pre-wrap") !== null;
            const textElem = article.querySelector(".markdown") || article.querySelector(".whitespace-pre-wrap");
            if (textElem) {
                turns.push({
                    role: isUser ? "user" : "assistant",
                    text: getCleanText(textElem)
                });
            }
        }
    });
    return turns;
}

function extractClaude() {
    const turns = [];
    const elements = document.querySelectorAll(".font-user-message, .font-claude-message, [data-testid='user-message'], [data-testid='claude-message'], .chat-turn");

    elements.forEach(el => {
        let role = "assistant";
        if (el.classList.contains("font-user-message") ||
            el.getAttribute("data-testid") === "user-message" ||
            el.getAttribute("data-is-user") === "true" ||
            el.closest(".font-user-message")) {
            role = "user";
        }

        const contentNode = el.querySelector(".prose, div.text-foreground") || el;
        const text = getCleanText(contentNode);
        if (text) {
            turns.push({ role, text });
        }
    });
    return turns;
}

function extractGemini() {
    const turns = [];
    const elements = document.querySelectorAll("user-query, model-response, .query-content, .model-response, message-content");

    elements.forEach(el => {
        let role = "assistant";
        if (el.tagName === "USER-QUERY" || el.classList.contains("query-content") || el.closest(".query-content")) {
            role = "user";
        } else if (el.tagName === "MODEL-RESPONSE" || el.classList.contains("model-response") || el.closest(".model-response")) {
            role = "assistant";
        }

        const text = getCleanText(el);
        if (text) {
            turns.push({ role, text });
        }
    });
    return turns;
}

function extractPerplexity() {
    const turns = [];
    const blocks = document.querySelectorAll("[class*='UserPrompt'], [class*='Answer'], .prose, div.relative.grid");

    blocks.forEach(el => {
        let role = "assistant";
        const classStr = el.className.toLowerCase();

        if (classStr.includes("userprompt") || el.querySelector("[class*='UserPrompt']")) {
            role = "user";
        }

        const contentNode = el.querySelector(".prose") || el;
        const text = getCleanText(contentNode);
        if (text && text.length > 5) {
            turns.push({ role, text });
        }
    });
    return turns;
}

function extractFallback() {
    const turns = [];
    const bubbleContainers = document.querySelectorAll("[class*='message'], [class*='chat-turn'], [class*='bubble'], article, [role='log'] > div");

    if (bubbleContainers.length > 0) {
        bubbleContainers.forEach(container => {
            const text = getCleanText(container);
            if (text && text.length > 10) {
                const classStr = container.className.toLowerCase();
                let role = "assistant";
                if (classStr.includes("user") || classStr.includes("prompt") || classStr.includes("query") || classStr.includes("human")) {
                    role = "user";
                }
                turns.push({ role, text });
            }
        });
    }

    if (turns.length === 0) {
        const main = document.querySelector("main") || document.querySelector("#main") || document.body;
        const blocks = main.querySelectorAll("p, pre");
        blocks.forEach(b => {
            const text = b.innerText.trim();
            if (text.length > 15) {
                turns.push({ role: "user", text });
            }
        });
    }
    return turns;
}

function extractConversation() {
    let turns = [];
    const platform = getPlatformName();

    try {
        if (platform === "chatgpt") turns = extractChatGPT();
        else if (platform === "claude") turns = extractClaude();
        else if (platform === "gemini") turns = extractGemini();
        else if (platform === "perplexity") turns = extractPerplexity();

        if (turns.length === 0) turns = extractFallback();
    } catch (e) {
        console.error("Synapse AI: Scraper error", e);
        turns = extractFallback();
    }

    const cleanedTurns = [];
    turns.forEach(turn => {
        if (turn.text && turn.text.length > 2) {
            const last = cleanedTurns[cleanedTurns.length - 1];
            if (last && last.role === turn.role) {
                last.text += "\n\n" + turn.text;
            } else {
                cleanedTurns.push({ role: turn.role, text: turn.text });
            }
        }
    });

    return cleanedTurns;
}

function generateSmartTitle(turns) {
    const firstUserMsg = turns.find(t => t.role === "user");
    if (firstUserMsg && firstUserMsg.text) {
        let clean = firstUserMsg.text.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
        if (clean.length > 25) {
            return clean.substring(0, 22) + "...";
        }
        return clean || "AI Conversation";
    }

    let pageTitle = document.title || "";
    pageTitle = pageTitle.replace(/Chat(GPT)?|Claude|Gemini|Perplexity/gi, "").replace(/[^\w\s-]/g, "").trim();
    if (pageTitle.length > 20) {
        pageTitle = pageTitle.substring(0, 18) + "...";
    }
    return pageTitle || `Synapse - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}


// ==========================================
// 3.5 PDF & DOCUMENT ATTACHMENT EXTRACTION ENGINE
// ==========================================
function detectAttachmentsInElement(element) {
    const attachments = [];

    // Broad scan: walk through all small leaf elements to find filename nodes
    try {
        const leafElements = element.getElementsByTagName("*");
        for (let el of leafElements) {
            // Check only small metadata-displaying elements to avoid parsing large blocks
            if (el.children.length > 5) continue;

            const textContent = (el.innerText || el.textContent || "").trim();
            // Matches typical filename layout
            const fileMatch = textContent.match(/^([a-zA-Z0-9_\-\s\.\(\)]+\.(pdf|docx|txt|xlsx|pptx|csv|py|js|json|md|epub|png|jpg|jpeg|gif))$/i);

            if (fileMatch) {
                const fname = fileMatch[1].trim();
                const ext = fileMatch[2].toLowerCase();
                if (fname.length > 3 && fname.length < 90 && !attachments.some(a => a.filename === fname)) {
                    attachments.push({
                        filename: fname,
                        extension: ext,
                        preview: ""
                    });
                }
            }
        }
    } catch (e) {
        console.error("Synapse AI: Error scanning leaf nodes in attachment detector", e);
    }

    // Fallback scan: Search text content for standard file extensions via regex
    try {
        const text = element.innerText || "";
        const regex = /\b([a-zA-Z0-9_\-\s\.\(\)]+\.(pdf|docx|txt|xlsx|pptx|csv|py|js|json|md|epub|png|jpg|jpeg|gif))\b/gi;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const fname = match[1].trim();
            const ext = match[2].toLowerCase();
            if (fname.length > 3 && fname.length < 90 && !attachments.some(a => a.filename === fname)) {
                attachments.push({
                    filename: fname,
                    extension: ext,
                    preview: ""
                });
            }
        }
    } catch (e) {
        console.error("Synapse AI: Error executing text regex on attachment detector", e);
    }

    return attachments;
}


function summarizeDocumentMemory(attachment, conversation) {
    const filename = attachment.filename;
    const lowerFilename = filename.toLowerCase();
    const nameWithoutExt = filename.replace(/\.[a-zA-Z0-9]+$/, "").toLowerCase();

    const importantTopics = new Set();
    const previouslyDiscussed = [];

    conversation.forEach(turn => {
        const text = turn.text;
        const lowerText = text.toLowerCase();

        const isMentioned = lowerText.includes(lowerFilename) ||
            (nameWithoutExt.length > 3 && lowerText.includes(nameWithoutExt));

        if (isMentioned) {
            const sentences = text.split(/[.!?\n]/);
            sentences.forEach(sentence => {
                const s = sentence.trim();
                if (s.length > 15 && s.length < 150) {
                    const lowerS = s.toLowerCase();
                    // Extract sentences discussing actions, concepts, rules, or proofs
                    if (lowerS.includes("discuss") || lowerS.includes("explain") ||
                        lowerS.includes("show") || lowerS.includes("proof") ||
                        lowerS.includes("topic") || lowerS.includes("concept") ||
                        lowerS.includes("use") || lowerS.includes("implement")) {
                        previouslyDiscussed.push(s);
                    }
                }
            });
        }
    });

    // Scan context for standard academic/engineering keywords
    const keywordsList = [
        "subset", "combinatorics", "graph theory", "greedy algorithm", "optimization",
        "proof", "theorem", "induction", "logic", "discrete", "database", "schema",
        "authentication", "security", "component", "routing", "controller", "model"
    ];

    conversation.forEach(turn => {
        const lowerText = turn.text.toLowerCase();
        keywordsList.forEach(kw => {
            if (lowerText.includes(kw)) {
                importantTopics.add(kw);
            }
        });
    });

    // Fallback topic keywords from the filename itself
    if (importantTopics.size === 0) {
        const parts = filename.split(/[\s_\-\.]+/);
        parts.forEach(p => {
            if (p.length > 3 && !["pdf", "docx", "txt", "xlsx", "epub", "book", "document", "file"].includes(p.toLowerCase())) {
                importantTopics.add(p.toLowerCase());
            }
        });
    }

    const topicsArr = Array.from(importantTopics).slice(0, 5);
    const discussionArr = [...new Set(previouslyDiscussed)].slice(0, 4);

    return {
        filename: filename,
        extension: attachment.extension,
        preview: attachment.preview || "",
        importantTopics: topicsArr,
        previouslyDiscussed: discussionArr,
        summary: `Document "${filename}" was attached. Topics: ${topicsArr.join(", ")}.`
    };
}

function extractAttachedDocuments(conversation) {
    const platform = getPlatformName();
    let msgElements = [];

    if (platform === "chatgpt") {
        msgElements = document.querySelectorAll("article");
    } else if (platform === "claude") {
        msgElements = document.querySelectorAll(".font-user-message, .font-claude-message, [data-testid='user-message'], [data-testid='claude-message']");
    } else if (platform === "gemini") {
        msgElements = document.querySelectorAll("user-query, model-response, .query-content, .model-response, message-content");
    } else {
        msgElements = document.querySelectorAll("[class*='message'], [class*='chat-turn'], [class*='bubble'], article");
    }

    const rawAttachments = [];
    msgElements.forEach(el => {
        const atts = detectAttachmentsInElement(el);
        atts.forEach(a => {
            if (!rawAttachments.some(ra => ra.filename === a.filename)) {
                rawAttachments.push(a);
            }
        });
    });

    const documents = [];
    rawAttachments.forEach(att => {
        documents.push(summarizeDocumentMemory(att, conversation));
    });

    return documents;
}


// ==========================================
// 4. UNIVERSAL CROSS-LLM ADAPTER SYSTEM
// ==========================================
const PlatformAdapters = {
    chatgpt: {
        getInputBox: () => document.querySelector('#prompt-textarea'),
        getSendButton: () => document.querySelector('button[data-testid="send-button"], button[aria-label="Send prompt"]'),
        getAnchorButton: () => document.querySelector('button[data-testid="send-button"], form button[aria-label*="voice"], form button:has(svg)'),
        inject: (inputBox, text) => {
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
            if (nativeSetter) nativeSetter.call(inputBox, text);
            else inputBox.value = text;
            inputBox.dispatchEvent(new Event("input", { bubbles: true }));
            const tracker = inputBox._valueTracker;
            if (tracker) tracker.setValue(text);
        }
    },
    claude: {
        getInputBox: () => document.querySelector('div[contenteditable="true"].ProseMirror'),
        getSendButton: () => document.querySelector('button[aria-label*="Send"], button[aria-label*="send"]'),
        getAnchorButton: () => document.querySelector('button[aria-label*="Send"], button[aria-label*="dictate"], button[aria-label*="voice"]'),
        inject: (inputBox, text) => {
            inputBox.focus();
            const range = document.createRange();
            range.selectNodeContents(inputBox);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand("insertText", false, text);
            inputBox.dispatchEvent(new Event("input", { bubbles: true }));
        }
    },
    gemini: {
        getInputBox: () => {
            // Try multiple selectors in priority order for Gemini's evolving DOM
            return document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                document.querySelector('rich-textarea div[contenteditable="true"]') ||
                document.querySelector('.ql-editor') ||
                document.querySelector('div.input-area div[contenteditable]') ||
                document.querySelector('div[contenteditable="true"]');
        },
        getSendButton: () => document.querySelector('button[aria-label*="Send message"], button.send-button, button[data-mat-icon-name*="send"]'),
        getAnchorButton: () => document.querySelector('button[aria-label*="microphone"], button[aria-label*="Use microphone"], button[aria-label*="Send message"]'),
        inject: (inputBox, text) => {
            inputBox.focus();
            // Select all existing content
            const range = document.createRange();
            range.selectNodeContents(inputBox);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);

            // Primary: execCommand — Gemini's Quill/Lexical hooks this natively
            const success = document.execCommand("insertText", false, text);

            // Fallback: synthetic paste — Gemini listens to paste events too
            if (!success || !inputBox.textContent.trim()) {
                const dataTransfer = new DataTransfer();
                dataTransfer.setData("text/plain", text);
                inputBox.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dataTransfer }));
            }

            // Final fallback: direct DOM write
            if (!inputBox.textContent.trim()) {
                inputBox.innerHTML = "";
                const p = document.createElement("p");
                p.textContent = text;
                inputBox.appendChild(p);
            }

            inputBox.dispatchEvent(new Event("input", { bubbles: true }));
            // NOTE: No Enter keydown here — that would re-trigger our interceptor
        }
    },
    perplexity: {
        getInputBox: () => document.querySelector('textarea[placeholder*="Ask"], textarea'),
        getSendButton: () => document.querySelector('button[aria-label*="Submit"], button[aria-label*="send"]'),
        getAnchorButton: () => document.querySelector('button[aria-label*="Submit"], button[aria-label*="send"], button:has(svg path[d*="M12 14c1.66"])'),
        inject: (inputBox, text) => {
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
            if (nativeSetter) nativeSetter.call(inputBox, text);
            else inputBox.value = text;
            inputBox.dispatchEvent(new Event("input", { bubbles: true }));
        }
    },
    fallback: {
        getInputBox: () => {
            const fallbacks = ["#prompt-textarea", "textarea[placeholder*='message']", "textarea[placeholder*='chat']", "textarea[placeholder*='Ask']", "div[contenteditable='true']", "div[role='textbox']", "textarea"];
            for (const selector of fallbacks) {
                const el = document.querySelector(selector);
                if (el && el.offsetWidth > 0) return el;
            }
            return null;
        },
        getSendButton: () => document.querySelector('button[aria-label*="Send"], button[aria-label*="Submit"], button[data-testid="send-button"]'),
        getAnchorButton: () => document.querySelector('button[aria-label*="voice"], button[aria-label*="mic"], button[aria-label*="Dictate"], button[data-testid*="send"], button[aria-label*="Send"]'),
        inject: (inputBox, text) => {
            inputBox.focus();
            if (inputBox.tagName === "TEXTAREA" || inputBox.tagName === "INPUT") {
                inputBox.value = text;
                inputBox.dispatchEvent(new Event("input", { bubbles: true }));
            } else {
                const range = document.createRange();
                range.selectNodeContents(inputBox);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                if (!document.execCommand("insertText", false, text)) {
                    const dt = new DataTransfer();
                    dt.setData("text/plain", text);
                    inputBox.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
                }
                inputBox.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }
    }
};

function getActiveAdapter() {
    const platform = getPlatformName();
    return PlatformAdapters[platform] || PlatformAdapters.fallback;
}

function findInputBox() {
    return getActiveAdapter().getInputBox() || PlatformAdapters.fallback.getInputBox();
}

function injectValue(inputBox, text) {
    if (!inputBox) return;
    const adapter = getActiveAdapter();
    try {
        adapter.inject(inputBox, text);
    } catch (e) {
        console.error("Synapse: Adapter injection failed", e);
        PlatformAdapters.fallback.inject(inputBox, text);
    }
    inputBox.scrollTop = inputBox.scrollHeight;
}

function findTargetContainer() {
    const adapter = getActiveAdapter();
    let primaryBtn = adapter.getAnchorButton() || PlatformAdapters.fallback.getAnchorButton();
    if (!primaryBtn) return null;

    let toolbar = null;
    let referenceNode = null;
    let parent = primaryBtn.parentElement;

    while (parent && parent.tagName !== "BODY") {
        const style = window.getComputedStyle(parent);
        if (style.display === "flex" || style.display === "inline-flex" || style.display === "grid") {
            const isMainBar = parent.offsetHeight < 100 && (parent.offsetWidth > 120 || parent.querySelectorAll("button, [role='button']").length >= 2);
            if (isMainBar) {
                toolbar = parent;
                break;
            }
        }
        parent = parent.parentElement;
    }

    if (toolbar) {
        let ancestor = primaryBtn;
        while (ancestor && ancestor.parentElement !== toolbar) ancestor = ancestor.parentElement;
        return { container: toolbar, referenceNode: ancestor };
    }
    return null;
}


// ==========================================
// 6. POP-OVER INTERFACE LOGIC
// ==========================================
function createPopoverElement() {
    let popover = document.getElementById("synapse-popover");
    if (!popover) {
        popover = document.createElement("div");
        popover.id = "synapse-popover";
        popover.className = "synapse-popover";
        popover.innerHTML = `
            <h3>Generate Memory</h3>
            <div class="synapse-input-wrapper" style="margin-top: 4px;">
                <input type="text" id="synapse-title-input" placeholder="Synapse Name...">
            </div>
            <div class="synapse-btn-row" style="margin-top: 4px; margin-bottom: 6px;">
                <button id="synapse-btn-generate" class="synapse-action-btn" style="width: 100%;">Generate</button>
            </div>
            <h3 style="margin-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 6px;">Synapse Library</h3>
            <div id="synapse-list" class="synapse-list-container">
                <div style="font-size: 10px; color: #9ca3af; text-align: center; padding: 10px 0;">No synapses saved yet.</div>
            </div>
        `;
        document.body.appendChild(popover);

        // Bind Actions
        popover.querySelector("#synapse-btn-generate").addEventListener("click", generateCapsule);

        renderPopoverList();
    }
}

function togglePopover() {
    const popover = document.getElementById("synapse-popover");
    if (!popover) return;

    const isShowing = popover.classList.contains("show");
    if (isShowing) {
        popover.classList.remove("show");
    } else {
        const titleInput = document.getElementById("synapse-title-input");
        if (titleInput) {
            const conversation = extractConversation();
            titleInput.value = generateSmartTitle(conversation);
        }

        popover.classList.add("show");
        positionPopover();

        renderPopoverList();
    }
}

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function syncWithCloud(callback) {
    if (!isChromeContextValid()) { console.warn("Synapse: Extension context lost. Please refresh the page."); return; } chrome.runtime.sendMessage({ action: "syncCapsules" }, (response) => {
        if (response && response.success && response.capsules) {
            safeStorageGet(["capsules"], (result) => {
                let localCapsules = result.capsules || [];
                const cloudCapsules = response.capsules;

                cloudCapsules.forEach(cloudCap => {
                    const existsIdx = localCapsules.findIndex(c => c.id === cloudCap.id);
                    if (existsIdx > -1) {
                        localCapsules[existsIdx] = cloudCap;
                    } else {
                        localCapsules.unshift(cloudCap);
                    }
                });

                safeStorageSet({ capsules: localCapsules }, () => {
                    if (callback) callback();
                });
            });
        } else {
            if (callback) callback();
        }
    });
}

function resolveCapsuleKey(key, callback) {
    safeStorageGet(["capsules"], (result) => {
        const capsules = result.capsules || [];
        const normalizedKey = key.trim().toUpperCase();
        const matched = capsules.find(c => {
            const capKey = c.key ? c.key.toUpperCase() : "";
            const capTitleKey = `@CAP-${c.title.toUpperCase().replace(/[^A-Z0-9]/g, "-")}`;
            return capKey === normalizedKey || capTitleKey === normalizedKey;
        });

        if (matched) {
            callback(matched);
        } else {
            if (!isChromeContextValid()) { console.warn("Synapse: Extension context lost. Please refresh the page."); return; } chrome.runtime.sendMessage({ action: "resolveCapsule", key: normalizedKey }, (response) => {
                if (response && response.success && response.capsule) {
                    callback(response.capsule);
                } else {
                    callback(null);
                }
            });
        }
    });
}

function renderListItems(capsules) {
    const listContainer = document.getElementById("synapse-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    if (capsules.length === 0) {
        listContainer.innerHTML = `<div style="font-size: 10px; color: #9ca3af; text-align: center; padding: 10px 0;">No synapses saved yet.</div>`;
        return;
    }

    capsules.forEach(capsule => {
        const item = document.createElement("div");
        item.className = "synapse-list-item";
        item.setAttribute("draggable", "true");

        const capKey = capsule.key || `@CAP-${capsule.title.toUpperCase().replace(/[^A-Z0-9]/g, "-")}`;

        item.innerHTML = `
            <span class="synapse-item-name" title="${escapeHtml(capsule.title)} (${capKey})">${escapeHtml(capsule.title)}</span>
            <div class="synapse-item-actions">
                <button class="synapse-mini-btn" title="Drop context key to active chat" data-key="${escapeHtml(capKey)}">Drop</button>
            </div>
        `;

        item.addEventListener("dragstart", (e) => {
            e.dataTransfer.setData("text/plain", capKey);
            item.style.opacity = "0.4";
        });

        item.addEventListener("dragend", () => {
            item.style.opacity = "1";
        });

        item.querySelector(".synapse-mini-btn").addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const inputBox = findInputBox();
            if (!inputBox) {
                showNotification("Prompt input box not found. Ensure prompt bar is loaded.", "error");
                return;
            }

            const popover = document.getElementById("synapse-popover");
            if (popover) popover.classList.remove("show");

            // Use dropContextAndSend for silent auto-submit with handoff wrapper
            dropContextAndSend(capsule, inputBox);
        });

        listContainer.appendChild(item);
    });
}

function renderPopoverList() {
    const listContainer = document.getElementById("synapse-list");
    if (!listContainer) return;

    safeStorageGet(["capsules"], (result) => {
        const capsules = result.capsules || [];
        renderListItems(capsules);

        syncWithCloud(() => {
            safeStorageGet(["capsules"], (result2) => {
                renderListItems(result2.capsules || []);
            });
        });
    });
}

function positionPopover() {
    const popover = document.getElementById("synapse-popover");
    const button = document.getElementById("synapse-input-btn");
    if (!popover || !button) return;

    const btnRect = button.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    // Position fixed floating coordinates centered above button
    const topPos = btnRect.top - popoverRect.height - 10;
    const leftPos = btnRect.left + (btnRect.width / 2) - (popoverRect.width / 2);

    popover.style.position = "fixed";
    popover.style.top = `${topPos}px`;
    popover.style.left = `${leftPos}px`;
    popover.style.bottom = "auto";
    popover.style.right = "auto";
}

// Click outside popover to close it
function handlePopoverCloseClick(e) {
    const popover = document.getElementById("synapse-popover");
    const button = document.getElementById("synapse-input-btn");
    if (popover && popover.classList.contains("show")) {
        if (!popover.contains(e.target) && !button.contains(e.target)) {
            popover.classList.remove("show");
        }
    }
}


// ==========================================
// 6.5 TOAST NOTIFICATION UTILS
// ==========================================
function showNotification(message, type = "error") {
    let container = document.getElementById("synapse-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "synapse-toast-container";
        container.style.cssText = `
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            gap: 12px;
            pointer-events: none;
            font-family: 'Outfit', sans-serif;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.style.cssText = `
        background: rgba(18, 18, 24, 0.92);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid ${type === 'success' ? 'rgba(0, 200, 150, 0.35)' : 'rgba(239, 68, 68, 0.35)'};
        border-left: 4px solid ${type === 'success' ? '#00c896' : '#ef4444'};
        color: #f3f4f6;
        padding: 12px 18px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
        transform: translateX(120%);
        transition: transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        display: flex;
        align-items: center;
        gap: 10px;
        pointer-events: auto;
        cursor: pointer;
        min-width: 250px;
        box-sizing: border-box;
    `;

    const icon = type === 'success' ?
        '<span style="color:#00c896; font-size:16px;">✓</span>' :
        '<span style="color:#ef4444; font-size:16px;">⚠</span>';

    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);

    // Force layout reflow
    toast.offsetHeight;

    // Animate in
    toast.style.transform = "translateX(0)";

    const dismiss = () => {
        toast.style.transform = "translateX(125%)";
        setTimeout(() => toast.remove(), 400);
    };

    const timeout = setTimeout(dismiss, 3500);

    toast.addEventListener("click", () => {
        clearTimeout(timeout);
        dismiss();
    });
}

// ==========================================
// 6.8 INTELLIGENT CONTEXT CAPSULE ENGINE
// ==========================================
// Dedup, clean and cap a list of extracted strings
function cleanList(arr, maxItems = 6) {
    if (!arr) return [];
    const noise = new Set([
        "important point", "important concept", "note", "warning", "remember",
        "yes", "no", "this", "that", "use", "using", "test", "example",
        "question", "answer", "correct", "wrong"
    ]);
    const seen = new Set();
    const out = [];
    for (let item of arr) {
        if (!item) continue;
        item = item.trim()
            .replace(/^[:\s\-*•◉#\d\.\)]+/, "")
            .replace(/^(of|the|a|an|about|on|to|for|with|by|from|in|at)\s+/i, "")
            .trim();
        if (item.length > 0) item = item[0].toUpperCase() + item.slice(1);
        const low = item.toLowerCase();
        if (item.length < 5 || item.length > 120) continue;
        if (noise.has(low)) continue;
        if (seen.has(low)) continue;
        seen.add(low);
        out.push(item);
    }
    return out.slice(0, maxItems);
}

// Extract the last meaningful code block from the full conversation text
function extractLastCodeBlock(allText) {
    const blocks = [];
    const re = /```([a-zA-Z0-9+#-]*)\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(allText)) !== null) {
        blocks.push({ lang: m[1].trim(), code: m[2].trim() });
    }
    if (blocks.length === 0) return null;
    const last = blocks[blocks.length - 1];
    return last.code.length > 1200
        ? last.code.substring(0, 1197) + "..."
        : last.code;
}

// Build a 2-4 sentence plain-English summary of the entire conversation
function buildSessionSummary(conversation, title) {
    const userMsgs = conversation.filter(t => t.role === "user");
    const assistantMsgs = conversation.filter(t => t.role === "assistant");
    const firstUser = userMsgs[0] ? userMsgs[0].text.replace(/```[\s\S]*?```/g, "").trim().substring(0, 120) : "";
    const lastUser = userMsgs.length > 1 ? userMsgs[userMsgs.length - 1].text.replace(/```[\s\S]*?```/g, "").trim().substring(0, 120) : "";
    const msgCount = conversation.length;
    const topic = title && title !== "Conversation Synapse" ? title : (firstUser.substring(0, 60) || "general topics");
    let summary = `The conversation covers "${topic}" across ${msgCount} messages. `;
    if (firstUser) summary += `It started with: "${firstUser.substring(0, 80)}${firstUser.length > 80 ? '...' : ''}". `;
    if (lastUser && lastUser !== firstUser) summary += `The most recent request was: "${lastUser.substring(0, 100)}${lastUser.length > 100 ? '...' : ''}"."`;
    return summary.trim();
}

function analyzeConversationMemory(conversation, title) {
    const allUserText = conversation.filter(t => t.role === "user").map(t => t.text).join("\n");
    const allText = conversation.map(t => t.text).join("\n");
    const allTextLower = allText.toLowerCase();

    // --- Project Name ---
    let projectName = (title && title !== "Conversation Synapse") ? title : "General Conversation";
    const projectPatterns = [
        /(?:project|app|system|extension|tool|website|platform)\s*(?:name|called|titled|named)?\s*[:=]?\s*["']?([A-Z][A-Za-z0-9 _-]{2,25})/i,
        /(?:building|creating|developing|working on|making)\s+(?:a |an |the )?["']?([A-Z][A-Za-z0-9 _-]{2,25})/
    ];
    for (const pat of projectPatterns) {
        const m = allText.match(pat);
        if (m && m[1] && m[1].trim().length > 2) { projectName = m[1].trim(); break; }
    }

    // --- Session Summary ---
    const sessionSummary = buildSessionSummary(conversation, title);

    // --- All User Questions ---
    const userQuestions = [];
    const userMsgs = conversation.filter(t => t.role === "user");
    for (const msg of userMsgs) {
        const sentences = msg.text.replace(/```[\s\S]*?```/g, "").split(/[.!?\n]+/).map(s => s.trim());
        for (const s of sentences) {
            if (s.length > 15 && s.length < 200 && (s.toLowerCase().startsWith("how") || s.toLowerCase().startsWith("what") || s.toLowerCase().startsWith("why") || s.toLowerCase().startsWith("can you") || msg.text.includes(s + "?"))) {
                userQuestions.push(s + (s.endsWith("?") ? "" : "?"));
            } else if (s.length > 15 && s.length < 200 && (s.toLowerCase().startsWith("create") || s.toLowerCase().startsWith("build") || s.toLowerCase().startsWith("write") || s.toLowerCase().startsWith("fix"))) {
                userQuestions.push(s);
            }
        }
    }
    if (userQuestions.length === 0) {
        const firstUser = userMsgs[0] ? userMsgs[0].text.replace(/```[\s\S]*?```/g, "").trim().substring(0, 150) : "";
        if (firstUser) userQuestions.push(firstUser);
    }
    const all_user_questions = [...new Set(userQuestions)];

    // --- All Assistant Responses Summary ---
    const assistantResponses = [];
    const astMsgs = conversation.filter(t => t.role === "assistant");
    for (const msg of astMsgs) {
        const sentences = msg.text.replace(/```[\s\S]*?```/g, "").split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 20);
        if (sentences.length > 0) {
            assistantResponses.push(sentences.slice(0, 2).join(". ") + ".");
        }
    }
    const all_assistant_responses_summary = assistantResponses;

    // --- Main Topics via domain map + pattern matching ---
    const domainMap = {
        "Digital Logic Design": ["flip-flop", "latch", "nand", "nor", "logic gate", "boolean", "k-map", "sequential circuit", "clock signal"],
        "Discrete Mathematics": ["greedy algorithm", "subset", "combinatorics", "graph theory", "proof by induction", "set theory", "recurrence"],
        "Object-Oriented Programming": ["class ", "inheritance", "polymorphism", "encapsulation", "constructor", "overload", "override"],
        "Data Structures & Algorithms": ["linked list", "binary tree", "stack", "queue", "sorting", "big o", "recursion", "hash map"],
        "Web Development": ["react", "next.js", "tailwind", "html", "css", "typescript", "dom", "frontend"],
        "Mobile / App Dev": ["flutter", "dart", "android", "ios", "widget", "state management"],
        "Cloud & Backend": ["firebase", "firestore", "authentication", "mongodb", "postgres", "node", "express", "rest api"],
        "C++ Programming": ["#include", "using namespace std", "cout", "cin", "vector<", "int main"],
        "Python Programming": ["def ", "import numpy", "pandas", "matplotlib", "print(", "list comprehension"],
        "Database Systems": ["sql", "query", "join", "schema", "table", "foreign key", "normalization"]
    };
    const rawTopics = [];
    for (const [domain, kws] of Object.entries(domainMap)) {
        if (kws.some(kw => allTextLower.includes(kw))) rawTopics.push(domain);
    }
    const topicPat = /(?:about|studying|covering|discussing|working on|topic of|related to)\s+([a-zA-Z][a-zA-Z0-9 ,&/-]{4,40})/gi;
    let tm;
    while ((tm = topicPat.exec(allText)) !== null) rawTopics.push(tm[1]);
    const mainTopics = cleanList(rawTopics, 6);

    // --- Important Concepts ---
    const rawConcepts = [];
    const conceptPats = [
        /([A-Z][a-zA-Z0-9 _-]{2,30})\s+(?:is defined as|refers to|means that|is when|is a type of)/gi,
        /(?:concept of|principle of|definition of|understanding of|explain)\s+([a-zA-Z0-9 _-]{4,35})/gi,
        /(?:theorem|algorithm|pattern|protocol|formula|rule|law|property)\s+(?:called|named|known as)?\s*([A-Za-z][a-zA-Z0-9 _-]{2,30})/gi
    ];
    for (const pat of conceptPats) {
        let cm; while ((cm = pat.exec(allText)) !== null) rawConcepts.push(cm[1]);
    }
    const importantConcepts = cleanList(rawConcepts, 6);

    // --- Completed Tasks ---
    const rawTasks = [];
    const taskPats = [
        /(?:implemented|completed|solved|fixed|added|built|designed|configured|resolved|wrote|created)\s+(?:the |a |an )?([a-zA-Z][a-zA-Z0-9 _()-]{5,60})/gi,
        /(?:done|finished|working now|that works|successfully)\s*[:\-]?\s*([a-zA-Z][a-zA-Z0-9 _()-]{5,60})/gi
    ];
    for (const pat of taskPats) {
        let tk; while ((tk = pat.exec(allText)) !== null) rawTasks.push(tk[1]);
    }
    const completedTasks = cleanList(rawTasks, 5);

    // --- Unresolved Issues ---
    const rawIssues = [];
    const issuePats = [
        /(?:still broken|not working|failing|stuck on|blocked by|error with|issue with|problem with|bug in|doesn't work)\s*[:\-]?\s*([a-zA-Z][a-zA-Z0-9 _()-]{5,70})/gi,
        /(?:TODO|FIXME|HACK|unresolved|need to fix|needs to be fixed)\s*[:\-]?\s*([a-zA-Z][a-zA-Z0-9 _()-]{5,70})/gi
    ];
    for (const pat of issuePats) {
        let im; while ((im = pat.exec(allText)) !== null) rawIssues.push(im[1]);
    }
    const unresolvedIssues = cleanList(rawIssues, 4);

    // --- Current Goal ---
    let currentGoal = "";
    const lastUserMsgs = conversation.filter(t => t.role === "user").slice(-3);
    for (let i = lastUserMsgs.length - 1; i >= 0; i--) {
        let txt = lastUserMsgs[i].text.replace(/```[\s\S]*?```/g, "").trim();
        if (!txt) continue;
        const gm = txt.match(/(?:now |next |currently |I need to |I want to |let'?s |please |help me |goal is to )([^\n.!?]{8,100})/i);
        if (gm) { currentGoal = gm[0].trim(); break; }
    }
    if (!currentGoal) {
        for (let i = lastUserMsgs.length - 1; i >= 0; i--) {
            const lines = lastUserMsgs[i].text
                .replace(/```[\s\S]*?```/g, "")
                .split("\n").map(l => l.trim())
                .filter(l => l.length >= 8 &&
                    !l.includes("#include") && !l.includes("using namespace") &&
                    !l.startsWith("class ") && !l.startsWith("def ") &&
                    !l.startsWith("import ") && !l.includes("public static void"));
            if (lines.length > 0) { currentGoal = lines[0].substring(0, 100); break; }
        }
    }
    if (!currentGoal) currentGoal = "Continue from where the conversation left off.";
    currentGoal = currentGoal.replace(/^[:\s\-*•◉#\d\.\)]+/, "").trim();

    // --- Code Context ---
    const langs = new Set();
    const codeBlockLangs = allText.match(/```([a-zA-Z0-9+#-]+)/g);
    if (codeBlockLangs) codeBlockLangs.forEach(b => { const l = b.replace("```", "").trim(); if (l) langs.add(l); });
    const fwKws = ["react", "flutter", "next.js", "vue", "angular", "firebase", "node", "express", "django", "flask", "tailwind"];
    const detectedFw = fwKws.filter(fw => allTextLower.includes(fw));

    const key_code_blocks = [];
    const reCode = /```([a-zA-Z0-9+#-]*)\n([\s\S]*?)```/g;
    let mCode;
    while ((mCode = reCode.exec(allText)) !== null) {
        if (mCode[2].trim().length > 10) {
            key_code_blocks.push("```" + mCode[1] + "\n" + mCode[2].trim() + "\n```");
        }
    }

    const codeContext = {
        code_present: key_code_blocks.length > 0,
        language_or_stack: [...langs].join(", ") || (detectedFw.join(", ") || "Unknown"),
        key_code_blocks: key_code_blocks,
        current_code_state: key_code_blocks.length > 0 ? "Code blocks provided in context." : "No code blocks."
    };

    // --- Document Context ---
    const docTitlePat = /\b([A-Za-z][a-zA-Z0-9 _\-]{3,40}\.(?:pdf|docx|txt|xlsx|pptx|epub|md))\b/gi;
    const docTitles = [];
    let dtm; while ((dtm = docTitlePat.exec(allText)) !== null) {
        if (!docTitles.includes(dtm[1])) docTitles.push(dtm[1]);
    }
    const hasDocs = docTitles.length > 0 || allTextLower.includes("attached file") || allTextLower.includes("pdf") || allTextLower.includes("slides") || allTextLower.includes("book");

    const docsArray = [];
    if (hasDocs) {
        const docSentences = allText.split(/[.!?\n]/).filter(s => {
            const sl = s.toLowerCase();
            return s.trim().length > 20 &&
                (sl.includes("pdf") || sl.includes("book") || sl.includes("slide") || sl.includes("chapter") || sl.includes("document") || sl.includes("attached") || docTitles.some(d => sl.includes(d.toLowerCase().split(".")[0])));
        });
        const keyDocContent = docSentences.slice(0, 15).map(s => s.trim()).join(". ") || "Documents were referenced.";

        if (docTitles.length > 0) {
            docTitles.forEach(t => {
                docsArray.push({
                    title: t,
                    type: "Document",
                    full_extracted_content: keyDocContent,
                    how_it_was_used: "Referenced in conversation."
                });
            });
        } else {
            docsArray.push({
                title: "Attached Document",
                type: "Document",
                full_extracted_content: keyDocContent,
                how_it_was_used: "Referenced in conversation."
            });
        }
    }

    const documentContext = {
        documents_present: hasDocs,
        documents: docsArray
    };

    // --- User Preferences ---
    const rawPrefs = [];
    const prefPats = [
        /(?:I prefer|please use|always|make sure to|avoid|don't use|keep it|I like|I want)\s+([^.!?\n]{5,60})/gi
    ];
    for (const pat of prefPats) {
        let pm; while ((pm = pat.exec(allUserText)) !== null) rawPrefs.push(pm[0].trim());
    }
    const userPreferences = cleanList(rawPrefs, 4);

    // --- Critical Context ---
    const criticalContext = cleanList([...rawPrefs, ...rawIssues], 3);

    // --- Handoff Instructions ---
    const isAcademic = mainTopics.some(t => [
        "Digital Logic Design", "Discrete Mathematics", "Data Structures & Algorithms",
        "Database Systems", "Object-Oriented Programming"
    ].includes(t));
    const isCoding = (langs.size > 0 || key_code_blocks.length > 0);
    let handoffInstruction = "";
    if (isCoding && key_code_blocks.length > 0) {
        const stackStr = [...langs].join("/") || detectedFw.join("/") || "";
        handoffInstruction = `The user is working on ${projectName}${stackStr ? " using " + stackStr : ""}. The conversation ended at: "${currentGoal}". Resume immediately by addressing this. Reference the code blocks in code_context. Use code blocks in all responses. Be precise and direct.`;
    } else if (isAcademic) {
        handoffInstruction = `The user is studying ${mainTopics.slice(0, 2).join(" and ")}. The session ended at: "${currentGoal}". Continue by reinforcing key concepts, checking for gaps, and explaining next steps. Use examples and diagrams where helpful.`;
    } else {
        handoffInstruction = `Resume the conversation about ${projectName}. The user's last focus was: "${currentGoal}". Pick up exactly where the conversation left off. Don't repeat prior explanations. Be direct.`;
    }

    return {
        capsule_version: "2.0",
        source_platform: getPlatformName(),
        project_name: projectName,
        session_summary: sessionSummary,
        all_user_questions: all_user_questions.length > 0 ? all_user_questions : ["Started a new discussion."],
        all_assistant_responses_summary: all_assistant_responses_summary.length > 0 ? all_assistant_responses_summary : ["Awaiting instruction."],
        main_topics: mainTopics.length > 0 ? mainTopics : ["General Discussion"],
        important_concepts: importantConcepts,
        document_context: documentContext,
        code_context: codeContext,
        completed_tasks: completedTasks,
        unresolved_issues: unresolvedIssues,
        current_goal: currentGoal,
        user_preferences: userPreferences,
        critical_context: criticalContext,
        handoff_instruction: handoffInstruction
    };
}


// ==========================================
// 6.5 LOCAL DOCUMENT EXTRACTION HELPERS
// ==========================================

async function extractPDFTextLocally(file) {
    try {
        if (!window['pdfjs-dist/build/pdf']) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('libs/pdf.min.js');
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        const pdfjsLib = window['pdfjs-dist/build/pdf'];
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('libs/pdf.worker.min.js');
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map(item => item.str).join(' ') + '\n';
        }
        return fullText;
    } catch (e) {
        console.warn('Synapse: PDF extraction failed:', e);
        return '';
    }
}

async function extractDOCXTextLocally(file) {
    try {
        if (!window.mammoth) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('libs/mammoth.min.js');
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.mammoth.extractRawText({ arrayBuffer });
        return result.value || '';
    } catch (e) {
        console.warn('Synapse: DOCX extraction failed:', e);
        return '';
    }
}

function compressTextLocally(rawText, maxChars = 2000) {
    if (!rawText || rawText.trim() === '') return '';
    const cleaned = rawText.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxChars) return cleaned;
    const firstPart = cleaned.slice(0, Math.floor(maxChars * 0.6));
    const lastPart = cleaned.slice(-Math.floor(maxChars * 0.4));
    return firstPart + '\n\n[...compressed...]\n\n' + lastPart;
}


// Global generation lock variables on window object to prevent duplicate executions across script contexts
if (typeof window.synapseIsGenerating === 'undefined') {
    window.synapseIsGenerating = false;
}
if (typeof window.synapseLastGenerationTime === 'undefined') {
    window.synapseLastGenerationTime = 0;
}

// ==========================================
// 7. LOCAL SEMANTIC ENGINE (zero API calls)
// ==========================================

function extractTopicsLocally(allText) {
    const stopWords = new Set([
        'the','a','an','and','or','but','in','on','at','to','for',
        'of','with','by','from','is','are','was','were','be','been',
        'have','has','had','do','does','did','will','would','could',
        'should','may','might','can','i','you','he','she','we','they',
        'it','this','that','these','those','my','your','his','her',
        'our','its','what','how','when','where','why','which','who',
        'just','like','so','if','then','than','also','about','up',
        'out','no','not','now','get','got','let','use','used','make',
        'made','said','say','go','going','want','need','know','think',
        'okay','yes','yeah','please','thank','thanks','hello','hi'
    ]);
    const wordCount = {};
    const words = allText.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    words.forEach(word => {
        if (!stopWords.has(word)) wordCount[word] = (wordCount[word] || 0) + 1;
    });
    return Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([word]) => word);
}

function extractCurrentGoal(messages) {
    const userMessages = messages.filter(m => m.role === 'user').reverse();
    for (const msg of userMessages) {
        const text = (msg.content || '').trim();
        if (text.includes('?') ||
            /^(how|what|why|when|where|can you|please|help|explain|show|tell|give|write|create|fix|solve)/i.test(text)) {
            return text.slice(0, 120).replace(/\n/g, ' ').trim();
        }
    }
    const last = userMessages[0];
    return last ? (last.content || '').slice(0, 120).replace(/\n/g, ' ').trim() : 'No clear goal detected';
}

function extractConcepts(allText) {
    const conceptPatterns = [
        /([A-Z][a-zA-Z\s]{2,30})\s+is\s+/g,
        /([A-Z][a-zA-Z\s]{2,30})\s+are\s+/g,
        /called\s+([A-Za-z\s]{2,30})/g,
        /known as\s+([A-Za-z\s]{2,30})/g,
        /([A-Z]{2,}[a-zA-Z\s]*)/g
    ];
    const concepts = new Set();
    conceptPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(allText)) !== null) {
            const concept = match[1].trim();
            if (concept.length > 2 && concept.length < 40) concepts.add(concept);
        }
    });
    return [...concepts].slice(0, 8);
}

function extractUnresolvedIssues(messages) {
    const issues = [];
    const issuePatterns = [
        /not working/i, /doesn't work/i, /error/i, /problem/i,
        /issue/i, /bug/i, /stuck/i, /confused/i, /don't understand/i,
        /still not/i, /failed/i, /why is/i, /why does/i
    ];
    messages.filter(m => m.role === 'user').slice(-10).forEach(msg => {
        const text = (msg.content || '').toLowerCase();
        if (issuePatterns.some(p => p.test(text))) {
            issues.push((msg.content || '').slice(0, 100).replace(/\n/g, ' ').trim());
        }
    });
    return issues.slice(0, 4);
}

function extractUserPreferences(messages) {
    const prefs = [];
    const allUserText = messages.filter(m => m.role === 'user').map(m => m.content || '').join(' ');
    if (/step.?by.?step|one by one/i.test(allUserText))      prefs.push('Prefers step-by-step explanations');
    if (/simple|easy|basic|beginner/i.test(allUserText))     prefs.push('Wants simple, beginner-friendly explanations');
    if (/example|show me|demonstrate/i.test(allUserText))    prefs.push('Learns better with examples');
    if (/diagram|visual|chart/i.test(allUserText))           prefs.push('Likes visual diagrams');
    if (/exam|test|paper|quiz/i.test(allUserText))           prefs.push('Preparing for exam — practice questions preferred');
    if (/code|program|function|class/i.test(allUserText))    prefs.push('Working with code — show full implementations');
    if (/short|brief|quick|summarize/i.test(allUserText))    prefs.push('Prefers brief concise answers');
    return prefs.length > 0 ? prefs : ['No strong preferences detected'];
}

async function generateCapsuleLocally(conversationData) {
    const messages  = conversationData.messages  || [];
    const documents = conversationData.documents || [];
    const allText   = messages.map(m => m.content || '').join(' ');

    const firstUserMsg = messages.find(m => m.role === 'user');
    const projectHint  = firstUserMsg
        ? (firstUserMsg.content || '').slice(0, 60).replace(/\n/g, ' ').trim()
        : 'Unknown Project';

    const topics   = extractTopicsLocally(allText);
    const goal     = extractCurrentGoal(messages);

    return {
        capsule_version : '2.1-local',
        source_platform : conversationData.platform || window.location.hostname,
        project         : projectHint,
        topics,
        important_concepts : extractConcepts(allText),
        current_goal       : goal,
        unresolved_issues  : extractUnresolvedIssues(messages),
        user_preferences   : extractUserPreferences(messages),
        recent_context     : messages.slice(-8).map(m => ({
            role    : m.role,
            content : (m.content || '').slice(0, 300)
        })),
        document_context : {
            documents_present : documents.length > 0,
            documents : documents.map(d => ({
                title       : d.title,
                type        : d.type,
                key_content : d.compressedText
                    ? d.compressedText.slice(0, 500)
                    : '[Document attached — text could not be extracted locally.]'
            }))
        },
        handoff : `The user was working on: "${projectHint}". Topics covered: ${topics.join(', ')}. Their current goal: ${goal}. ${documents.length > 0 ? 'They shared ' + documents.length + ' document(s) — content is in document_context.' : 'No documents were shared.'} Continue naturally from where they left off.`
    };
}

// ==========================================
// 7.5 HYBRID CAPSULE ENGINE (Groq + local fallback)
// ==========================================

// ── REPLACE THIS KEY if you hit 429 rate limit errors ──
// Get a free key at: https://console.groq.com/keys
const GROQ_API_KEY = "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";

async function generateCapsuleHybrid(conversationData) {
    const messages  = conversationData.messages  || [];
    const documents = conversationData.documents || [];

    const recentMessages = messages.slice(-6);

    const shortTranscript = recentMessages
        .map(m => `${m.role}: ${(m.content || '').slice(0, 300)}`)
        .join('\n');

    const shortDocSummary = documents.length > 0
        ? documents.map(d =>
            `${d.title}: ${(d.compressedText || '').slice(0, 400)}`
          ).join('\n')
        : 'No documents attached.';

    const tinyPrompt = `Analyze and return JSON only. No markdown. No explanation.

Chat:
${shortTranscript}

Docs:
${shortDocSummary}

Return this exact JSON:
{
  "project": "specific descriptive title like OOP Exam Prep or DLD Study",
  "topics": ["real subject topics only — like inheritance, encapsulation, NOT random words"],
  "important_concepts": ["concept name: what it actually means"],
  "current_goal": "one complete sentence describing what user was trying to do",
  "unresolved_issues": ["real unfinished problems only"],
  "user_preferences": ["how user likes to learn"],
  "document_summary": "one sentence describing what the documents contain"
}`;

    // Show exact error instead of hiding it
    let response;
    try {
        response = await fetch(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + GROQ_API_KEY
                },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a semantic memory engine. Return raw JSON only. No markdown. No explanation. No code fences.'
                        },
                        {
                            role: 'user',
                            content: tinyPrompt
                        }
                    ],
                    temperature: 0,
                    max_tokens: 500
                })
            }
        );
    } catch (networkErr) {
        // Throw real network error — do NOT fall back silently
        throw new Error('Groq network error: ' + networkErr.message +
            ' — Check manifest.json has https://api.groq.com/* in host_permissions');
    }

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error(
                '❌ Invalid Groq API key. ' +
                'Go to console.groq.com/keys and get a new one.'
            );
        }
        if (response.status === 429) {
            throw new Error(
                '⚠️ Groq daily limit reached (14,400 free requests). ' +
                'This resets at midnight automatically. ' +
                'Or get a fresh key at console.groq.com/keys.'
            );
        }
        const errText = await response.text();
        // Throw real API error — do NOT fall back silently
        throw new Error('Groq API error ' + response.status + ': ' + errText);
    }

    const data = await response.json();

    if (!data.choices?.[0]?.message?.content) {
        throw new Error('Groq returned empty response: ' + JSON.stringify(data));
    }

    const rawText = data.choices[0].message.content.trim();
    const cleaned = rawText
        .replace(/^```json\n?/, '')
        .replace(/^```\n?/, '')
        .replace(/\n?```$/, '')
        .trim();

    let aiCapsule;
    try {
        aiCapsule = JSON.parse(cleaned);
    } catch (e) {
        throw new Error('Groq JSON parse failed. Raw output: ' + cleaned.slice(0, 200));
    }

    return {
        capsule_version    : '2.2-hybrid',
        source_platform    : conversationData.platform || window.location.hostname,
        project            : aiCapsule.project,
        topics             : aiCapsule.topics             || [],
        important_concepts : aiCapsule.important_concepts || [],
        current_goal       : aiCapsule.current_goal       || '',
        unresolved_issues  : aiCapsule.unresolved_issues  || [],
        user_preferences   : aiCapsule.user_preferences   || [],
        // Full recent context stored locally — never sent to Groq
        recent_context : messages.slice(-8).map(m => ({
            role    : m.role,
            content : (m.content || '').slice(0, 400)
        })),
        document_context : {
            documents_present : documents.length > 0,
            document_summary  : aiCapsule.document_summary || '',
            documents : documents.map(d => ({
                title       : d.title,
                type        : d.type,
                key_content : (d.compressedText || '').slice(0, 1500)
            }))
        },
        handoff : `User is working on: ${aiCapsule.project}. Goal: ${aiCapsule.current_goal}. ${documents.length > 0 ? documents.length + ' document(s) are in document_context with extracted content.' : 'No documents.'} Continue naturally from where they left off.`
    };
}

// ── SILENT FILE INTERCEPTOR ──────────────────────────────────────
// Fires when user uploads ANY file to ChatGPT, Gemini, or Claude
// User sees nothing — happens completely in background

async function handleInterceptedFile(file) {
  try {
    console.log('🔵 Synapse intercepted:', file.name);
    
    let extractedText = '';
    
    if (file.name.endsWith('.pdf') || file.type === 'application/pdf') {
      extractedText = await extractPDFTextLocally(file);
    } else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
      extractedText = await extractDOCXTextLocally(file);
    } else if (file.name.endsWith('.pptx') || file.name.endsWith('.ppt')) {
      extractedText = await extractPPTXText(file);
    } else if (file.name.endsWith('.txt')) {
      extractedText = await file.text();
    } else if (file.type.startsWith('image/')) {
      extractedText = '[Image: ' + file.name + ' — visual content cannot be extracted]';
    }

    if (!extractedText || extractedText.trim().length < 10) {
      console.warn('Synapse: No text extracted from', file.name);
      return;
    }

    // Use current page URL as conversation key
    // This links the doc to THIS specific conversation
    const conversationKey = window.location.href;

    safeStorageGet(['synapse_intercepted'], (result) => {
      const allIntercepted = result.synapse_intercepted || {};
      
      // allIntercepted is now an OBJECT keyed by conversation URL
      // not a flat array anymore
      if (!allIntercepted[conversationKey]) {
        allIntercepted[conversationKey] = [];
      }

      // Remove old version of same file in this conversation
      allIntercepted[conversationKey] = allIntercepted[conversationKey]
        .filter(d => d.title !== file.name);

      // Add new version linked to this conversation
      allIntercepted[conversationKey].push({
        title: file.name,
        type: file.type || 'unknown',
        compressedText: compressTextLocally(extractedText, 3000),
        charCount: extractedText.length,
        capturedAt: new Date().toISOString(),
        source: 'intercepted'
      });

      safeStorageSet({ synapse_intercepted: allIntercepted });
      console.log('✅ Synapse saved', file.name, 
        'for conversation:', conversationKey);
    });

  } catch (err) {
    console.warn('Synapse interception failed for', file.name, err);
  }
}

// Listen for ALL file inputs across entire page
// true = capture phase fires before ChatGPT handles it
document.addEventListener('change', async (e) => {
  if (!window.synapseInitialized && !isChromeContextValid()) return;
  if (!window.synapseIsAuthenticated) return;
  if (!e.target || e.target.type !== 'file') return;
  if (!e.target.files || e.target.files.length === 0) return;

  for (const file of e.target.files) {
    await handleInterceptedFile(file);
  }
}, true);

// Also watch for dynamically added file inputs
// ChatGPT sometimes creates file inputs dynamically
const fileInputObserver = new MutationObserver((mutations) => {
  if (!window.synapseIsAuthenticated) return;
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      const inputs = node.querySelectorAll 
        ? node.querySelectorAll('input[type="file"]')
        : [];
      inputs.forEach(input => {
        input.addEventListener('change', async (e) => {
          if (!e.target.files) return;
          for (const file of e.target.files) {
            await handleInterceptedFile(file);
          }
        });
      });
    });
  });
});

fileInputObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// PPTX text extraction
async function extractPPTXText(file) {
  try {
    const text = await file.text();
    const matches = text.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
    const extracted = matches
      .map(t => t.replace(/<[^>]+>/g, '').trim())
      .filter(t => t.length > 2)
      .join(' ');
    return extracted || '[PPTX: could not extract slide text]';
  } catch (e) {
    return '[PPTX extraction failed]';
  }
}

async function generateCapsule() {
    // Guard: block parallel calls
    if (window.synapseIsGenerating) {

        console.warn("Synapse: Generation blocked. Already in progress.");
        return;
    }
    const now = Date.now();
    if (now - window.synapseLastGenerationTime < 10000) {
        showNotification("Please wait 10 seconds between generations.", "error");
        return;
    }
    window.synapseIsGenerating = true;
    window.synapseLastGenerationTime = now;

    const titleInput = document.getElementById("synapse-title-input");
    const title = titleInput ? titleInput.value.trim() : "Conversation Synapse";

    // Close popover, animate button
    const popover = document.getElementById("synapse-popover");
    if (popover) popover.classList.remove("show");
    const btn = document.getElementById("synapse-input-btn");
    if (btn) btn.classList.add("animating");

    // Setup loading toast
    let container = document.getElementById("synapse-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "synapse-toast-container";
        container.style.cssText = `position: fixed; top: 24px; right: 24px; z-index: 2147483647; display: flex; flex-direction: column; gap: 12px; font-family: 'Outfit', sans-serif;`;
        document.body.appendChild(container);
    }
    let loadingToast = document.getElementById("synapse-loading-toast");
    let loadingTextSpan;
    if (!loadingToast) {
        loadingToast = document.createElement("div");
        loadingToast.id = "synapse-loading-toast";
        loadingToast.style.cssText = `
            background: rgba(18, 18, 24, 0.92); backdrop-filter: blur(20px);
            border: 1px solid rgba(0, 163, 255, 0.35); border-left: 4px solid #00a3ff;
            color: #f3f4f6; padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 600;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); display: flex; align-items: center; gap: 10px;
            min-width: 250px; transform: translateX(120%); transition: transform 0.35s;
        `;
        const spinnerHtml = `<div style="width:16px; height:16px; border:2px solid rgba(0,163,255,0.2); border-top-color:#00a3ff; border-radius:50%; animation:synapse-spin 1s linear infinite;"></div><style>@keyframes synapse-spin { to { transform: rotate(360deg); } }</style>`;
        loadingTextSpan = document.createElement("span");
        loadingTextSpan.id = "synapse-loading-text";
        loadingToast.innerHTML = spinnerHtml;
        loadingToast.appendChild(loadingTextSpan);
        container.appendChild(loadingToast);
    } else {
        loadingTextSpan = document.getElementById("synapse-loading-text");
    }
    loadingToast.style.display = "flex";
    loadingToast.offsetHeight;
    loadingToast.style.transform = "translateX(0)";
    const loadingInterval = showLoadingAnimation('synapse-loading-text');

    try {
        const conversation = extractConversation();
        if (conversation.length === 0) {
            throw new Error("No messages detected in this conversation.");
        }

        // Get current conversation URL
        const currentConversationKey = window.location.href;

        // Load only docs from THIS conversation
        const interceptedResult = await new Promise(resolve => {
            safeStorageGet(['synapse_intercepted'], resolve);
        });

        const allIntercepted = interceptedResult.synapse_intercepted || {};
        const thisConversationDocs = allIntercepted[currentConversationKey] || [];

        console.log('Synapse: Found', thisConversationDocs.length, 
            'docs for this conversation');

        // Vault docs handled separately below (user chooses)
        const allDocuments = [...thisConversationDocs];

        console.log('Synapse: Documents for capsule:', 
            allDocuments.length,
            allDocuments.map(d => d.title + '(' + 
                Math.round((d.charCount||0)/1000) + 'k)').join(', ')
        );

        // Step 3: Generate capsule with hybrid engine (Gemini tiny prompt + local fallback)
        const messages = conversation.map(c => ({ role: c.role, content: c.text || c.content || '' }));
        const capsuleData = await generateCapsuleHybrid({
            messages,
            documents,
            platform: getPlatformName()
        });

        // Wrap with extension metadata and save
        const keyTitle = (title || 'Context').toUpperCase().replace(/[^A-Z0-9]/g, '-');
        const newCapsule = {
            id          : 'CAP-' + Date.now(),
            title       : title || capsuleData.project || 'Untitled Context',
            key         : `@CAP-${keyTitle}`,
            created_at  : new Date().toISOString(),
            platform    : getPlatformName(),
            // Flat local-engine fields
            project            : capsuleData.project,
            topics             : capsuleData.topics,
            important_concepts : capsuleData.important_concepts,
            current_goal       : capsuleData.current_goal,
            unresolved_issues  : capsuleData.unresolved_issues,
            user_preferences   : capsuleData.user_preferences,
            recent_context     : capsuleData.recent_context,
            document_context   : capsuleData.document_context,
            handoff            : capsuleData.handoff,
            conversation       : conversation
        };

        await new Promise((resolve) => {
            safeStorageGet(['capsules'], (result) => {
                const capsules = result.capsules || [];
                capsules.unshift(newCapsule);
                safeStorageSet({ capsules }, () => {
                    if (isChromeContextValid()) {
                        chrome.runtime.sendMessage({ action: 'saveCapsule', capsule: newCapsule });
                        console.log('Synapse: Firestore save message sent.');
                    }
                    setTimeout(() => {
                        if (btn) {
                            btn.classList.remove('animating');
                            btn.classList.add('pulse-success');
                            setTimeout(() => btn.classList.remove('pulse-success'), 600);
                        }
                        stopLoadingAnimation(loadingInterval, 'synapse-loading-text', '\u2705 Capsule ready!');
                        setTimeout(() => { loadingToast.style.transform = 'translateX(125%)'; }, 2000);
                        renderPopoverList();
                        resolve();
                    }, 1200);
                });
            });
        });

    } catch (err) {
        stopLoadingAnimation(loadingInterval, 'synapse-loading-text', '\u274C ' + (err.message || 'Generation failed'));
        setTimeout(() => { loadingToast.style.transform = 'translateX(125%)'; }, 2000);
        if (btn) btn.classList.remove('animating');
        showNotification(err.message || 'Failed to generate capsule.', 'error');
        console.error('Synapse: Generation failed:', err);
    } finally {
        window.synapseIsGenerating = false;
        console.log('Synapse: Generation unlocked.');
    }
}



// ==========================================
// 7.5 AUTO-SUBMIT UTILS
// ==========================================
function submitChat(inputBox) {
    const platform = getPlatformName();
    const adapter = getActiveAdapter();

    // Gemini's send button may only appear after the editor has content — poll briefly
    const attemptSubmit = (attemptsLeft) => {
        let sendBtn = adapter.getSendButton() || PlatformAdapters.fallback.getSendButton();

        if (sendBtn && !sendBtn.disabled) {
            const clickEvent = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window
            });
            clickEvent.__synapseInjected = true;
            sendBtn.dispatchEvent(clickEvent);
        } else if (attemptsLeft > 0) {
            // Retry after 100ms — editor frameworks update button state asynchronously
            setTimeout(() => attemptSubmit(attemptsLeft - 1), 100);
        } else {
            // Final fallback: Enter key on the inputbox
            const keydownEvent = new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            keydownEvent.__synapseInjected = true;
            inputBox.dispatchEvent(keydownEvent);
        }
    };

    // Gemini needs more time for its editor state to register new content before enabling send button
    const initialDelay = platform === "gemini" ? 200 : 0;
    setTimeout(() => attemptSubmit(5), initialDelay);
}


// ==========================================
// 8. PERIODIC CHECKS & DYNAMIC RE-INJECTION
// ==========================================
let synapseObserver = null;

function checkAndInjectButton() {
    if (!window.synapseIsAuthenticated) return;
    let btn = document.getElementById("synapse-input-btn");
    const target = findTargetContainer();

    if (target) {
        if (!btn) {
            btn = document.createElement("button");
            btn.id = "synapse-input-btn";
            btn.className = "synapse-input-btn";
            btn.title = "Synapse AI  - Click to Generate/Drop context";
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
                    <circle cx="12" cy="5" r="2.5" fill="currentColor"/>
                    <circle cx="5" cy="19" r="2.5" fill="currentColor"/>
                    <circle cx="19" cy="19" r="2.5" fill="currentColor"/>
                    <line x1="12" y1="7.5" x2="6.5" y2="16.5" />
                    <line x1="12" y1="7.5" x2="17.5" y2="16.5" />
                    <line x1="7.5" y1="19" x2="16.5" y2="19" />
                </svg>
            `;

            // Block all click propagation in capture phase so parent click-listeners (like Gemini plus icon or Claude wrappers) don't trigger!
            const stopPropagation = (e) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            };

            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                togglePopover();
            }, true);

            btn.addEventListener("mousedown", stopPropagation, true);
            btn.addEventListener("mouseup", stopPropagation, true);

            createPopoverElement();
        }

        // Sit directly before the reference node to line up in flex containers
        if (btn.parentElement !== target.container) {
            // Temporarily disconnect observer if active to avoid self-triggering
            if (synapseObserver) {
                synapseObserver.disconnect();
            }

            try {
                target.container.insertBefore(btn, target.referenceNode);
                console.log("Synapse AI: Button successfully injected.");
            } catch (e) {
                console.error("Synapse: Error inserting button:", e);
            }

            if (synapseObserver) {
                synapseObserver.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }
        }
    }
}

function setupMutationObserver() {
    if (synapseObserver) {
        console.log("Synapse: Observer already active.");
        return;
    }

    console.log("Synapse AI: Starting MutationObserver to monitor target container");

    // Run once immediately to find target and inject button
    checkAndInjectButton();

    // Use a small debounce/throttle to avoid spamming DOM checks on every micro-mutation
    let checkTimeout = null;

    synapseObserver = new MutationObserver((mutations) => {
        let shouldCheck = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                shouldCheck = true;
                break;
            }
        }

        if (shouldCheck) {
            if (checkTimeout) clearTimeout(checkTimeout);
            checkTimeout = setTimeout(() => {
                checkAndInjectButton();
            }, 100); // 100ms debounce
        }
    });

    synapseObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function initializeWithRetry(attempts = 0) {
    // If already initialized globally, exit immediately to prevent duplication
    if (window.synapseInitialized) {
        console.log("Synapse AI: Already initialized globally. Skipping.");
        return;
    }

    if (attempts > 5) {
        console.warn('Synapse: Max retries reached, giving up');
        return;
    }

    try {
        if (!chrome.runtime?.id) {
            console.log(`Synapse: Chrome context invalid, retrying in 1s (Attempt ${attempts + 1})`);
            setTimeout(() => initializeWithRetry(attempts + 1), 1000);
            return;
        }

        if (document.readyState === 'loading') {
            console.log(`Synapse: Document is loading, waiting for DOMContentLoaded (Attempt ${attempts})`);
            if (!window.synapseDOMContentLoadedRegistered) {
                window.synapseDOMContentLoadedRegistered = true;
                document.addEventListener('DOMContentLoaded', () => initializeWithRetry(attempts));
            }
            return;
        }

        // Set initialization guard immediately before registering listeners/observer
        window.synapseInitialized = true;
        console.log("Synapse AI: Initializing extension content script (Attempt " + attempts + ")");

        // Initialize MutationObserver instead of setInterval
        setupMutationObserver();

        // Register global event listeners exactly once
        console.log("Synapse AI: Registering global event listeners");
        document.addEventListener("click", handleGlobalClick, true);
        document.addEventListener("keydown", handleGlobalKeydown, true);
        document.addEventListener("drop", handleGlobalDrop, true);
        document.addEventListener("click", handlePopoverCloseClick);
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "togglePanel") {
                togglePopover();
                sendResponse({ success: true });
            } else if (request.action === 'generateCapsule') {
                if (!window.synapseIsAuthenticated) {
                    sendResponse({ error: "User is not authenticated. Please log in via the extension popup." });
                    return true;
                }
                const selectedDocs = request.selectedDocs || [];
                const messages = extractRecentMessages();

                generateCapsuleHybrid({
                    messages,
                    documents: selectedDocs,
                    platform: window.location.hostname
                }).then(capsule => {
                    capsule.id = Date.now().toString();
                    capsule.timestamp = new Date().toISOString();
                    safeStorageGet(['capsules'], (result) => {
                        const capsules = result.capsules || [];
                        capsules.push(capsule);
                        safeStorageSet({ capsules });
                    });
                    sendResponse({ success: true });
                }).catch(err => {
                    sendResponse({ error: err.message });
                });

                return true; // keeps message channel open for async
            }
        });

    } catch (e) {
        console.warn(`Synapse: Init attempt ${attempts} failed:`, e);
        // Clear initialized flag in case of failure to allow retry
        window.synapseInitialized = false;
        setTimeout(() => initializeWithRetry(attempts + 1), 1000);
    }
}

// Call this instead of running init code directly
initializeWithRetry();


// ==========================================
// 8.5 INVISIBLE MEMORY KEY INTERCEPTOR ENGINE
// ==========================================
function getInputValue(inputBox) {
    if (!inputBox) return "";
    const isTextArea = inputBox.tagName === "TEXTAREA" || inputBox.tagName === "INPUT";
    if (isTextArea) {
        return inputBox.value;
    } else {
        return inputBox.innerText || inputBox.textContent || "";
    }
}

function reconstructContext(capsule) {
    // Support both v2.1 flat structure and legacy structured_memory wrapper
    const isFlat = !capsule.structured_memory;
    const mem = capsule.structured_memory || capsule;

    if (isFlat) {
        // New flat schema (local engine v2.1)
        const dc = capsule.document_context || {};
        const hasDocs = dc.documents_present && dc.documents && dc.documents.length > 0;
        const recentCtx = capsule.recent_context || [];

        return `I'm continuing a session from another AI.

Project: ${capsule.project || capsule.title || 'Unknown'}
Topics: ${(capsule.topics || []).join(', ') || 'N/A'}
Key Concepts: ${(capsule.important_concepts || []).join(', ') || 'N/A'}
Current Goal: ${capsule.current_goal || 'Continue the conversation.'}
Unresolved: ${(capsule.unresolved_issues || []).join(', ') || 'none'}
Preferences: ${(capsule.user_preferences || []).join(', ') || 'none'}${hasDocs ? '\nDocuments shared: ' + dc.documents.map(d => d.title).join(', ') : ''}

Recent conversation:
${recentCtx.map(m => `[${m.role}]: ${m.content}`).join('\n')}${hasDocs ? '\n\nDocument content:\n' + dc.documents.map(d => `${d.title}: ${d.key_content}`).join('\n') : ''}

Confirm you understand and wait for my next message.`;
    }

    // Legacy structured_memory path (v2.0)
    const fmt = (arr, label) => (!arr || arr.length === 0) ? '' : `\n${label}:\n` + arr.map(i => `- ${i}`).join('\n');

    let codeSection = '';
    const cc = mem.code_context;
    if (cc && cc.code_present) {
        codeSection = `\n\n=== CODE CONTEXT ===\nStack: ${cc.language_or_stack || ''}\nState: ${cc.current_code_state || ''}`;
        if (cc.key_code_blocks && cc.key_code_blocks.length > 0) {
            codeSection += `\n\nKey Code:\n${cc.key_code_blocks.join('\n\n')}`;
        }
    }

    let docSection = '';
    const dc = mem.document_context;
    if (dc && dc.documents_present && dc.documents && dc.documents.length > 0) {
        const docStrs = dc.documents.map(d =>
            `Title: ${d.title}\nType: ${d.type}\nContent: ${d.key_content || d.semantic_summary || ''}\nUsage: ${d.how_it_was_used || ''}`);
        docSection = `\n\n=== DOCUMENT SUMMARIES ===\n${docStrs.join('\n\n')}`;
    }

    return `Continuing from another AI session. Full context below — read everything before responding.

[SYNAPSE CAPSULE v${mem.capsule_version || '2.0'}]
Project: ${mem.project_name || capsule.title || 'Unknown'}
Platform: ${mem.source_platform || capsule.platform || 'Unknown'}

Summary: ${mem.session_summary || ''}
${fmt(mem.main_topics, 'Topics')}${fmt(mem.important_concepts, 'Key Concepts')}${fmt(mem.completed_tasks, 'Completed')}${fmt(mem.unresolved_issues, 'Unresolved')}${fmt(mem.user_preferences, 'User Preferences')}${codeSection}${docSection}

Current Goal: ${mem.current_goal || 'Continue the conversation.'}

Handoff: ${mem.handoff_instruction || 'Resume the conversation. Be direct.'}

now confirm you understand my project and wait for my next message.`;
}

// Auto-send the context handoff silently and show a "Context loaded" indicator
function dropContextAndSend(capsule, inputBox) {
    const handoff = reconstructContext(capsule);

    injectValue(inputBox, handoff);

    const synapseBtn = document.getElementById("synapse-input-btn");
    if (synapseBtn) {
        synapseBtn.title = "Sending context...";
        synapseBtn.style.opacity = "0.6";
    }

    setTimeout(() => {
        submitChat(inputBox);
        setTimeout(() => {
            if (synapseBtn) {
                synapseBtn.style.opacity = "1";
                synapseBtn.title = "Synapse AI Link";
                synapseBtn.classList.add("pulse-success");
                setTimeout(() => synapseBtn.classList.remove("pulse-success"), 800);
            }
            showNotification("Context loaded ✓ — type your next message.", "success");
        }, 400);
    }, 300);
}


function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function processKeysInTextAsync(text, callback) {
    const patterns = [
        /@CAP-[A-Za-z0-9_-]+/gi,
        /◉CAP-[A-Za-z0-9_-]+/gi,
        /\/capsule\s+[a-zA-Z0-9_-]+/gi
    ];

    const foundKeys = [];
    for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
            matches.forEach(m => {
                const norm = m.trim();
                if (!foundKeys.includes(norm)) {
                    foundKeys.push(norm);
                }
            });
        }
    }

    if (foundKeys.length === 0) {
        callback({ text, found: false });
        return;
    }

    let resolvedCount = 0;
    let processedText = text;
    let foundAny = false;

    foundKeys.forEach(key => {
        resolveCapsuleKey(key, (capsule) => {
            resolvedCount++;
            if (capsule) {
                const reconstructed = reconstructContext(capsule);
                processedText = processedText.replace(new RegExp(escapeRegExp(key), 'gi'), reconstructed);
                foundAny = true;
            }

            if (resolvedCount === foundKeys.length) {
                callback({ text: processedText, found: foundAny });
            }
        });
    });
}

function handleGlobalClick(e) {
    if (e.__synapseInjected) return; // Prevent infinite loop

    const target = e.target.closest('button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="send"], button[aria-label*="Submit"], button.send-button');
    if (!target) return;

    const inputBox = findInputBox();
    if (!inputBox) return;

    const rawText = getInputValue(inputBox);
    const hasKeyPattern = /(@CAP-[A-Za-z0-9_-]+)|(◉CAP-[A-Za-z0-9_-]+)|(\/capsule\s+[a-zA-Z0-9_-]+)/i.test(rawText);

    if (hasKeyPattern) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        processKeysInTextAsync(rawText, ({ text, found }) => {
            if (found) {
                injectValue(inputBox, text);

                const synapseBtn = document.getElementById("synapse-input-btn");
                if (synapseBtn) {
                    synapseBtn.classList.add("pulse-success");
                    setTimeout(() => synapseBtn.classList.remove("pulse-success"), 600);
                }

                showNotification("Synapse Key detected! Restoring context...", "success");

                setTimeout(() => {
                    submitChat(inputBox);
                }, 150);
            } else {
                setTimeout(() => {
                    submitChat(inputBox);
                }, 50);
            }
        });
    }
}

function handleGlobalKeydown(e) {
    if (e.__synapseInjected) return; // Prevent infinite loop
    if (e.key === "Enter" && !e.shiftKey) {
        const inputBox = e.target.closest('#prompt-textarea, div[contenteditable="true"], div.ProseMirror, textarea');
        if (!inputBox) return;

        const rawText = getInputValue(inputBox);
        const hasKeyPattern = /(@CAP-[A-Za-z0-9_-]+)|(◉CAP-[A-Za-z0-9_-]+)|(\/capsule\s+[a-zA-Z0-9_-]+)/i.test(rawText);

        if (hasKeyPattern) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            processKeysInTextAsync(rawText, ({ text, found }) => {
                if (found) {
                    injectValue(inputBox, text);

                    const synapseBtn = document.getElementById("synapse-input-btn");
                    if (synapseBtn) {
                        synapseBtn.classList.add("pulse-success");
                        setTimeout(() => synapseBtn.classList.remove("pulse-success"), 600);
                    }

                    showNotification("Synapse Key detected! Restoring context...", "success");

                    setTimeout(() => {
                        submitChat(inputBox);
                    }, 150);
                } else {
                    submitChat(inputBox);
                }
            });
        }
    }
}



function handleGlobalDrop(e) {
    const inputBox = findInputBox();
    if (!inputBox) return;

    if (inputBox === e.target || inputBox.contains(e.target)) {
        const draggedText = e.dataTransfer.getData("text/plain");
        if (draggedText && draggedText.startsWith("@CAP-")) {
            e.preventDefault();
            e.stopPropagation();

            const synapseBtn = document.getElementById("synapse-input-btn");
            if (synapseBtn) {
                synapseBtn.classList.add("pulse-success");
                setTimeout(() => synapseBtn.classList.remove("pulse-success"), 600);
            }

            showNotification("Restoring Synapse memory...", "success");

            resolveCapsuleKey(draggedText, (capsule) => {
                if (capsule) {
                    // Use dropContextAndSend for silent auto-submit with handoff wrapper
                    dropContextAndSend(capsule, inputBox);
                } else {
                    showNotification("No matching Synapse capsule found for that key.", "error");
                }
            });
        }
    }
}