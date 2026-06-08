console.log("Synapse AI: In-context bridge active.");

// ── SYNAPSE AI — DEVELOPER CONFIG ──────────────────────────────
var GROQ_API_KEY = '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';
// ───────────────────────────────────────────────────────────────

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
    "🧠 Building Project Memory",
    "📄 Processing Documents",
    "🔍 Extracting Facts",
    "⚡ Generating Capsule",
    "✅ Capsule Ready"
];

function promiseWithTimeout(promise, timeoutMs, timeoutError) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(timeoutError || new Error("Timeout exceeded")), timeoutMs);
    });
    return Promise.race([
        promise,
        timeoutPromise
    ]).then((result) => {
        clearTimeout(timeoutId);
        return result;
    }, (error) => {
        clearTimeout(timeoutId);
        throw error;
    });
}


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

/* Memory Inspector CSS */
.synapse-inspector-backdrop {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    justify-content: center;
    align-items: center;
    z-index: 2147483646;
}
.synapse-inspector-backdrop.show {
    display: flex;
}
.synapse-inspector-modal {
    width: 800px;
    max-width: 95vw;
    height: 600px;
    background: rgba(18, 18, 24, 0.96);
    backdrop-filter: blur(25px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 50px rgba(0,0,0,0.85);
    font-family: 'Outfit', sans-serif;
    color: #f3f4f6;
    overflow: hidden;
    animation: synapse-modal-fade 0.3s cubic-bezier(0.19, 1, 0.22, 1);
}
@keyframes synapse-modal-fade {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
}
.synapse-inspector-header {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.synapse-inspector-title {
    font-size: 16px;
    font-weight: 700;
    background: linear-gradient(135deg, #00ffcc, #0099ff);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}
.synapse-inspector-subtitle {
    font-size: 11px;
    color: #9ca3af;
    margin-top: 2px;
}
.synapse-inspector-body {
    flex: 1;
    display: flex;
    overflow: hidden;
}
.synapse-inspector-sidebar {
    width: 200px;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    padding: 12px 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: rgba(0,0,0,0.15);
}
.synapse-inspector-tab-btn {
    padding: 10px 14px;
    border: none;
    background: transparent;
    color: #9ca3af;
    text-align: left;
    font-size: 13px;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.synapse-inspector-tab-btn:hover {
    background: rgba(255, 255, 255, 0.04);
    color: white;
}
.synapse-inspector-tab-btn.active {
    background: rgba(0, 255, 204, 0.1);
    color: #00ffcc;
    font-weight: 600;
}
.synapse-inspector-content {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    display: none;
    flex-direction: column;
    gap: 14px;
}
.synapse-inspector-content.active {
    display: flex;
}
.synapse-inspector-footer {
    padding: 14px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    background: rgba(0,0,0,0.1);
}
.inspector-form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.inspector-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: #9ca3af;
    letter-spacing: 0.5px;
}
.inspector-input, .inspector-textarea, .inspector-select {
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 8px 12px;
    color: white;
    font-size: 13px;
    font-family: inherit;
    box-sizing: border-box;
    transition: all 0.2s;
}
.inspector-input:focus, .inspector-textarea:focus, .inspector-select:focus {
    border-color: #00ffcc;
    box-shadow: 0 0 8px rgba(0, 255, 204, 0.2);
    outline: none;
}
.inspector-textarea {
    resize: vertical;
}
.inspector-items-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 380px;
    overflow-y: auto;
    padding-right: 4px;
}
.inspector-fact-row, .inspector-decision-row {
    display: flex;
    gap: 8px;
    align-items: center;
    background: rgba(255,255,255,0.02);
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.05);
    transition: border-color 0.2s;
}
.inspector-fact-row.p1 {
    border-left: 4px solid #00ffcc;
}
.inspector-fact-row.p2 {
    border-left: 4px solid #0099ff;
}
.inspector-fact-row.p3 {
    border-left: 4px solid #6b7280;
}
.inspector-btn-delete {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.25);
    color: #ef4444;
    border-radius: 6px;
    width: 28px;
    height: 28px;
    cursor: pointer;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
}
.inspector-btn-delete:hover {
    background: #ef4444;
    color: white;
}
.inspector-btn-add {
    background: rgba(0, 255, 204, 0.1);
    border: 1px solid rgba(0, 255, 204, 0.2);
    color: #00ffcc;
    padding: 8px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 12px;
    transition: all 0.2s;
    width: max-content;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.inspector-btn-add:hover {
    background: rgba(0, 255, 204, 0.2);
}
.inspector-btn-confirm {
    background: linear-gradient(135deg, #00ffcc, #0099ff);
    color: #0c0c14;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 700;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
}
.inspector-btn-confirm:hover {
    box-shadow: 0 4px 15px rgba(0, 255, 204, 0.4);
    transform: translateY(-1px);
}
.inspector-btn-cancel {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    color: white;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
}
.inspector-btn-cancel:hover {
    background: rgba(255,255,255,0.12);
}
.inspector-badge-count {
    background: rgba(255,255,255,0.1);
    color: #f3f4f6;
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
}
.inspector-fact-priority {
    background: rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.1);
    color: white;
    font-size: 12px;
    border-radius: 6px;
    padding: 4px;
    cursor: pointer;
    font-family: inherit;
    flex-shrink: 0;
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
function extractRecentMessages() {
  var messages = [];

  try {

    // ── CHATGPT ──────────────────────────────────────────────────
    if (window.location.hostname.includes('chatgpt.com')) {

      // Try multiple selectors — ChatGPT changes their DOM frequently
      var found = false;

      // Selector 1 — data-message-author-role (most reliable)
      var byRole = document.querySelectorAll(
        '[data-message-author-role]'
      );
      if (byRole.length > 0) {
        found = true;
        byRole.forEach(function(el) {
          var role = el.getAttribute('data-message-author-role');
          var text = (el.innerText || el.textContent || '').trim();
          if (text.length > 0) {
            messages.push({ 
              role: role === 'assistant' ? 'assistant' : 'user', 
              content: text 
            });
          }
        });
      }

      // Selector 2 — article tags with data-testid
      if (!found || messages.length < 3) {
        messages = [];
        var articles = document.querySelectorAll(
          'article[data-testid^="conversation-turn"]'
        );
        if (articles.length > 0) {
          found = true;
          articles.forEach(function(el) {
            var isUser = el.querySelector(
              '[data-message-author-role="user"]'
            );
            var text = (el.innerText || el.textContent || '').trim();
            if (text.length > 0) {
              messages.push({
                role: isUser ? 'user' : 'assistant',
                content: text
              });
            }
          });
        }
      }

      // Selector 3 — group divs (older ChatGPT layout)
      if (!found || messages.length < 3) {
        messages = [];
        var groups = document.querySelectorAll(
          '.group\\/conversation-turn, .group.w-full'
        );
        if (groups.length > 0) {
          found = true;
          groups.forEach(function(el) {
            var isUser = el.classList.contains('dark:bg-transparent') ||
              el.querySelector('[data-message-author-role="user"]');
            var text = (el.innerText || el.textContent || '').trim();
            if (text.length > 5) {
              messages.push({
                role: isUser ? 'user' : 'assistant',
                content: text
              });
            }
          });
        }
      }

      // Selector 4 — broadest fallback
      if (!found || messages.length < 3) {
        messages = [];
        var allDivs = document.querySelectorAll(
          'div[class*="message"], div[class*="turn"], div[class*="chat"]'
        );
        allDivs.forEach(function(el) {
          var text = (el.innerText || el.textContent || '').trim();
          if (text.length > 20 && text.length < 50000) {
            var isUser = el.className.includes('user') ||
              el.querySelector('[data-message-author-role="user"]');
            messages.push({
              role: isUser ? 'user' : 'assistant',
              content: text
            });
          }
        });
      }

      console.log('Synapse: ChatGPT extraction found', 
        messages.length, 'messages');
    }

    // ── GEMINI ───────────────────────────────────────────────────
    if (window.location.hostname.includes('gemini.google.com')) {
      
      var turns = document.querySelectorAll(
        'user-query, model-response, ' +
        '.user-query, .model-response, ' +
        '[data-turn-role], ' +
        '.conversation-container > div'
      );

      if (turns.length > 0) {
        turns.forEach(function(el) {
          var tagName = el.tagName.toLowerCase();
          var className = el.className || '';
          var isUser = tagName === 'user-query' || 
            className.includes('user-query') ||
            el.getAttribute('data-turn-role') === 'user';
          var text = (el.innerText || el.textContent || '').trim();
          if (text.length > 5) {
            messages.push({
              role: isUser ? 'user' : 'assistant',
              content: text
            });
          }
        });
      } else {
        // Fallback for Gemini
        var allEls = document.querySelectorAll(
          '[class*="query"], [class*="response"], [class*="message"]'
        );
        allEls.forEach(function(el) {
          var text = (el.innerText || el.textContent || '').trim();
          if (text.length > 10) {
            var isUser = (el.className || '').includes('query') ||
              (el.className || '').includes('user');
            messages.push({
              role: isUser ? 'user' : 'assistant',
              content: text
            });
          }
        });
      }

      console.log('Synapse: Gemini extraction found', 
        messages.length, 'messages');
    }

    // ── CLAUDE ───────────────────────────────────────────────────
    if (window.location.hostname.includes('claude.ai')) {

      var turns = document.querySelectorAll(
        '[data-testid="human-turn"], [data-testid="ai-turn"]'
      );

      if (turns.length > 0) {
        turns.forEach(function(el) {
          var isUser = el.getAttribute('data-testid') === 'human-turn';
          var text = (el.innerText || el.textContent || '').trim();
          if (text.length > 0) {
            messages.push({
              role: isUser ? 'user' : 'assistant',
              content: text
            });
          }
        });
      } else {
        // Fallback for Claude
        var allEls = document.querySelectorAll(
          '[class*="human"], [class*="assistant"], [class*="message"]'
        );
        allEls.forEach(function(el) {
          var text = (el.innerText || el.textContent || '').trim();
          if (text.length > 10) {
            var isUser = (el.className || '').includes('human');
            messages.push({
              role: isUser ? 'user' : 'assistant',
              content: text
            });
          }
        });
      }

      console.log('Synapse: Claude extraction found', 
        messages.length, 'messages');
    }

  } catch(e) {
    console.warn('Synapse: Extraction error:', e);
  }

  // Remove duplicates — same text appearing twice
  var seen = new Set();
  var unique = [];
  messages.forEach(function(m) {
    var key = (m.content || '').slice(0, 50);
    if (!seen.has(key) && (m.content || '').length > 5) {
      seen.add(key);
      m.text = m.content; // backward compatibility
      unique.push(m);
    }
  });

  console.log('Synapse: Final extraction:', unique.length, 
    'unique messages from', window.location.hostname);

  return unique;
}

function hasForbiddenText(t) {
  if (!t || typeof t !== 'string') return false;
  var forbiddenWords = ['be careful', 'probe', 'connected', 'warning', 'error', 'failing', 'stuck', 'completed', 'done', 'next', 'step', 'reply'];
  return forbiddenWords.some(function(w) { return t.toLowerCase().indexOf(w) !== -1; });
}

function validateProjectName(name) {
  if (!name || typeof name !== 'string') return false;
  var trimmed = name.trim();
  if (trimmed.length < 4) return false;
  
  var words = trimmed.split(/\s+/).filter(Boolean);
  var hasTitleIndicator = /controller|system|prep|manager|tracker|dashboard|tool|app|interface|website|hardware|software|firmware/i.test(trimmed);
  if (words.length < 3 && !hasTitleIndicator) {
    return false;
  }
  
  var forbidden = ['connected', 'completed', 'done', 'next', 'step', 'reply', 'probe', 'be careful', 'warning', 'error', 'failing', 'stuck'];
  var containsForbidden = forbidden.some(function(w) {
    return trimmed.toLowerCase().indexOf(w) !== -1;
  });
  if (containsForbidden) {
    return false;
  }
  
  return true;
}

function validateProjectPurpose(purpose) {
  if (!purpose || typeof purpose !== 'string') return false;
  var trimmed = purpose.trim();
  if (trimmed.length < 30) return false;
  
  var words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 5) return false;
  
  var stepPrefixes = /^(?:wiring|connecting|fixing|debugging|testing|stuck on|working on|adding|implementing|writing)\b/i;
  if (stepPrefixes.test(trimmed)) {
    return false;
  }
  
  // Reject short status statements
  if (/^[A-Za-z0-9_\s]{2,15}\s+(?:connected|completed|done|stuck|failed|failing)\b/i.test(trimmed)) {
    return false;
  }
  
  return true;
}

function generateSmartTitle(turns) {
    // 1. Try to find a title from the page title first, as it is the most reliable chat summary!
    let pageTitle = document.title || "";
    pageTitle = pageTitle.replace(/Chat(GPT)?|Claude|Gemini|Perplexity/gi, "").replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
    if (validateProjectName(pageTitle)) {
        return pageTitle;
    }

    // 2. Try the first user message but extract only title-like phrases (noun phrases) or first sentence
    const firstUserMsg = turns.find(t => t.role === "user");
    if (firstUserMsg && (firstUserMsg.text || firstUserMsg.content)) {
        let clean = (firstUserMsg.text || firstUserMsg.content).replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim();
        const match = clean.match(/(?:building|creating|making|developing|working on|prep for)\s+([^.\n]{10,50})/i);
        if (match) {
            const candidate = match[1].trim();
            if (validateProjectName(candidate)) {
                return candidate;
            }
        }
        
        const firstLine = clean.split('\n')[0].trim();
        if (validateProjectName(firstLine) && firstLine.length < 60) {
            return firstLine;
        }
    }

    return "";
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
            const conversation = extractRecentMessages();
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
    if (!isChromeContextValid()) {
        console.warn("Synapse: Extension context lost. Please refresh the page.");
        callback(null);
        return;
    }
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
            chrome.runtime.sendMessage({ action: "resolveCapsule", key: normalizedKey }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn("Synapse runtime error resolving capsule:", chrome.runtime.lastError);
                    callback(null);
                    return;
                }
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

            // Show restoring notification
            showNotification("Restoring Synapse memory...", "success");

            // Use dropCapsule for silent auto-submit with handoff wrapper
            dropCapsule(capsule);
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
        '<span style="color:#ef4444; font-size:16px;">⚠️</span>';

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
            .replace(/^[:\s\-*•\u25c9#\d\.\)]+/, "")
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
    currentGoal = currentGoal.replace(/^[:\s\-*•\u25c9#\d\.\)]+/, "").trim();

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
        return { text: fullText, pageCount: pdf.numPages };
    } catch (e) {
        console.warn('Synapse: PDF extraction failed:', e);
        return { text: '', pageCount: 0 };
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
// ==========================================
// 7.4 CONTINUOUS FACT EXTRACTOR
// ==========================================

var FACT_PATTERNS = [
  // Hardware / Electronics
  {
    type: 'hardware_configuration',
    patterns: [
      /(?:pin|Pin)\s*(\d+)\s*(?:=|is|to|for|connected to|→)\s*([^\n,\.]{2,40})/gi,
      /([A-Za-z0-9_\s]{2,20})\s*connected to\s*([^\n,\.]{2,40})/gi,
      /([A-Za-z0-9_\s]{2,20})\s*(?:=|is)\s*(?:pin|Pin)\s*(\d+)/gi,
      /I2C address\s*(?:is|=)\s*(0x[0-9A-Fa-f]+)/gi,
      /([A-Za-z0-9_]+)\s*(?:address|addr)\s*(?:is|=)\s*(0x[0-9A-Fa-f]+)/gi
    ]
  },
  // Code / Variables
  {
    type: 'code_detail',
    patterns: [
      /(?:const|let|var|int|float|String|bool)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n;]{1,60})/gi,
      /(?:function|void|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi,
      /(?:class)\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
      /#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+([^\n]{1,40})/gi
    ]
  },
  // Database / API
  {
    type: 'system_configuration',
    patterns: [
      /(?:database|db|collection)\s+(?:name\s+)?(?:is|=|named)\s+([A-Za-z0-9_-]{2,40})/gi,
      /(?:table|schema)\s+(?:name\s+)?(?:is|=|named)\s+([A-Za-z0-9_-]{2,40})/gi,
      /(?:API|endpoint|route|url)\s+(?:is|=)?\s+(\/[A-Za-z0-9\/_-]{2,60})/gi,
      /(?:port)\s+(?:is|=|:)\s+(\d{2,5})/gi,
      /(?:host|server)\s+(?:is|=|:)\s+([A-Za-z0-9._-]{4,60})/gi
    ]
  },
  // Decisions
  {
    type: 'user_decision',
    patterns: [
      /(?:decided|chose|selected|switched|going with|will use|using)\s+([^\n,\.]{4,60})/gi,
      /(?:rejected|not using|dropped|removed|replaced)\s+([^\n,\.]{4,60})/gi,
      /(?:instead of|rather than)\s+([^\n,\.]{4,60})/gi
    ]
  },
  // Bugs / State
  {
    type: 'system_state',
    patterns: [
      /([A-Za-z0-9_\s]{2,30})\s+(?:is|still|remains?)\s+(?:not working|broken|black|blank|stuck|failing|unresolved)/gi,
      /([A-Za-z0-9_\s]{2,30})\s+(?:is|now)\s+(?:working|fixed|done|complete|resolved)/gi,
      /(?:bug|error|issue|problem)\s*(?:in|with|on)?\s*([^\n,\.]{4,50})/gi
    ]
  },
  // Study / Academic
  {
    type: 'study_fact',
    patterns: [
      /([A-Z][a-z]+(?:\s[A-Za-z]+){0,3})\s+(?:is defined as|means|refers to)\s+([^\n\.]{4,80})/gi,
      /(?:formula|equation)\s*(?:for|of)?\s*([^\n=]{4,30})\s*(?:is|=)\s*([^\n]{4,60})/gi,
      /(?:exam|test|quiz)\s+(?:is on|covers?|includes?)\s+([^\n,\.]{4,60})/gi
    ]
  }
];

function calculateFactImportance(factText, type) {
  var text = (factText || '').toLowerCase();
  
  // Priority 1 triggers (always preserve)
  var priority1Keywords = [
    'led', 'relay', 'motor', 'arduino', 'esp32', 'esp8266', 'uno', 'nano', 'raspberry', 'mcu', 'controller',
    'pin mapping', 'pin assignment', 'pinout', 'oled', 'display', 'address', '0x', 'i2c', 'spi',
    'api_key', 'apikey', 'api key', 'secret', 'token', 'database', 'db', 'firestore', 'mongodb', 'sql', 'postgres',
    'architecture', 'system design', 'component', 'library', 'service', 'decided to', 'chose to', 'final design',
    'connections', 'output mapping', 'output assignments'
  ];
  
  // Priority 2 triggers (milestones, state, unresolved)
  var priority2Keywords = [
    'completed', 'finished', 'done', 'milestone', 'success', 'currently', 'now working', 'unresolved',
    'error', 'bug', 'issue', 'failing', 'state', 'status'
  ];
  
  // Priority 3 triggers (temporary, intermediate)
  var priority3Keywords = [
    'temporary', 'temp', 'for now', 'internally', 'temporarily', 'try connecting', 'testing', 'intermediate',
    'step', 'attempt', 'maybe', 'suggest'
  ];

  var isHardware = (type === 'hardware_configuration' || /pin|connected|wire|port|bus/i.test(text));
  var hasPin = /\bpin\b|\bconnected\b|→|=|to/i.test(text);
  
  if (priority1Keywords.some(function(kw) { return text.indexOf(kw) !== -1; })) {
    return 1;
  }
  
  var hardwareP1 = ['led', 'relay', 'motor', 'arduino', 'sensor', 'oled', 'display', 'screen', 'dht', 'temp', 'humidity', 'servo', 'driver'];
  if (isHardware && hasPin) {
    if (hardwareP1.some(function(kw) { return text.indexOf(kw) !== -1; })) {
      return 1;
    }
    if (/pin\s*\d+\s*(?:→|to|=)\s*(?:pin\s*)?\d+/i.test(text) || /temporary|temp/i.test(text)) {
      return 3;
    }
    return 1; 
  }

  if (priority2Keywords.some(function(kw) { return text.indexOf(kw) !== -1; })) {
    return 2;
  }

  if (priority3Keywords.some(function(kw) { return text.indexOf(kw) !== -1; })) {
    return 3;
  }

  if (type === 'user_decision' || type === 'system_configuration') {
    return 1;
  }
  if (type === 'system_state') {
    return 2;
  }
  
  return 2;
}

function extractFactsFromText(text) {
  var facts = [];
  var seen = new Set();
  FACT_PATTERNS.forEach(function(category) {
    category.patterns.forEach(function(pattern) {
      try {
        var regex = new RegExp(pattern.source, pattern.flags);
        var match;
        while ((match = regex.exec(text)) !== null) {
          var fact = match[0].trim().replace(/\s+/g, ' ').slice(0, 120);
          if (fact.length < 6) continue;
          if (seen.has(fact.toLowerCase())) continue;
          seen.add(fact.toLowerCase());
          var priority = calculateFactImportance(fact, category.type);
          facts.push({
            type: category.type,
            fact: fact,
            priority: priority,
            score: priority === 1 ? 10 : (priority === 2 ? 5 : 1),
            extractedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.error("Synapse fact scanner: invalid regex pattern in", category.type, pattern, err);
      }
    });
  });
  return facts;
}

// ── FACT SCANNER STATE ───────────────────────────────────────────
var factScannerState = {
  backfillDone: false,
  lastScannedLength: 0,
  lastUrl: window.location.href
};

// ── CONVERSATION KEY ─────────────────────────────────────────────
function getConvKey() {
  var url = window.location.href.split('?')[0];
  try {
    return 'facts_' + btoa(url).slice(0, 40);
  } catch(e) {
    return 'facts_' + url.slice(-40).replace(/[^a-z0-9]/gi, '_');
  }
}

// ── MAIN SCANNER ENTRY POINT ─────────────────────────────────────
async function initFactScanner() {
  if (!isChromeContextValid()) return;
  var convKey = getConvKey();
  safeStorageGet([convKey + '_backfilled'], function(result) {
    if (result[convKey + '_backfilled']) {
      console.log('Synapse: Backfill already done, starting incremental scan');
      factScannerState.backfillDone = true;
      startIncrementalScanner();
    } else {
      console.log('Synapse: Starting historical backfill scan...');
      runHistoricalBackfill(convKey).then(function() {
        startIncrementalScanner();
      });
    }
  });
}

// ── HISTORICAL BACKFILL ──────────────────────────────────────────
// Extracts ALL facts from entire conversation at once.
// Only runs once per conversation URL.
async function runHistoricalBackfill(convKey) {
  try {
    console.log('Synapse: Beginning full conversation scan...');
    var allMessages = extractRecentMessages();
    if (allMessages.length === 0) {
      console.log('Synapse: No messages found for backfill');
      var emptyObj = {};
      emptyObj[convKey + '_backfilled'] = true;
      safeStorageSet(emptyObj);
      factScannerState.backfillDone = true;
      return;
    }
    console.log('Synapse: Scanning', allMessages.length, 'messages for historical facts...');
    var fullConversationText = allMessages.map(function(m) {
      return (m.role || 'user') + ': ' + (m.content || m.text || '');
    }).join('\n\n');

    var allFacts = extractFactsFromText(fullConversationText);
    console.log('Synapse: Backfill found', allFacts.length, 'historical facts');

    var saveObj = {};
    if (allFacts.length > 0) {
      saveObj[convKey] = allFacts;
      saveObj[convKey + '_backfillCount'] = allFacts.length;
    }
    saveObj[convKey + '_backfilled'] = true;
    saveObj[convKey + '_backfillTime'] = new Date().toISOString();
    safeStorageSet(saveObj);

    factScannerState.backfillDone = true;
    factScannerState.lastScannedLength = fullConversationText.length;
    console.log('Synapse: Saved', allFacts.length, 'historical facts from backfill');
  } catch(e) {
    console.warn('Synapse: Backfill error:', e);
    factScannerState.backfillDone = true;
  }
}

// ── INCREMENTAL SCANNER ──────────────────────────────────────────
// Runs every 30 seconds after backfill, only scanning NEW content.
function startIncrementalScanner() {
  runIncrementalScan();
  setInterval(function() {
    if (window.location.href !== factScannerState.lastUrl) {
      factScannerState.lastUrl = window.location.href;
      factScannerState.lastScannedLength = 0;
      factScannerState.backfillDone = false;
      console.log('Synapse: New conversation detected, re-initializing...');
      setTimeout(initFactScanner, 2000);
      return;
    }
    runIncrementalScan();
  }, 30000);
}

async function runIncrementalScan() {
  if (!isChromeContextValid()) return;
  if (!factScannerState.backfillDone) return;
  try {
    var messages = extractRecentMessages();
    if (messages.length === 0) return;
    var fullText = messages.map(function(m) {
      return (m.content || m.text || '');
    }).join('\n');
    if (fullText.length <= factScannerState.lastScannedLength) return;
    var newText = fullText.slice(factScannerState.lastScannedLength);
    factScannerState.lastScannedLength = fullText.length;
    if (newText.trim().length < 20) return;
    var newFacts = extractFactsFromText(newText);
    if (newFacts.length === 0) return;
    var convKey = getConvKey();
    safeStorageGet([convKey], function(result) {
      var existing = result[convKey] || [];
      var existingTexts = new Set(
        existing.map(function(f) { return f.fact.toLowerCase().trim(); })
      );
      var toAdd = newFacts.filter(function(f) {
        return !existingTexts.has(f.fact.toLowerCase().trim());
      });
      if (toAdd.length === 0) return;
      var updated = existing.concat(toAdd);
      if (updated.length > 500) updated = updated.slice(-500);
      var saveObj = {};
      saveObj[convKey] = updated;
      safeStorageSet(saveObj);
      console.log('Synapse: Added', toAdd.length, 'new facts. Total:', updated.length);
    });
  } catch(e) {
    console.warn('Synapse: Incremental scan error:', e);
  }
}

// ── LOAD FACTS FOR CAPSULE GENERATION ───────────────────────────
async function loadStoredFacts() {
  var convKey = getConvKey();
  return new Promise(function(resolve) {
    safeStorageGet([convKey], function(result) {
      var facts = result[convKey] || [];
      console.log('Synapse: Loaded', facts.length, 'facts for capsule generation');
      resolve(facts);
    });
  });
}

// ── START SCANNER ────────────────────────────────────────────────
// Delay 3 seconds to let page fully load first, then run backfill.
setTimeout(function() {
  initFactScanner();
}, 3000);


// ==========================================
// 7.5 HYBRID CAPSULE ENGINE (Groq + local fallback)
// ==========================================

// ── REPLACE THIS KEY if you hit 429 rate limit errors ──
// Get a free key at: https://console.groq.com/keys

function tryRepairJson(jsonStr) {
  var cleaned = jsonStr.trim();
  var stack = [];
  var inString = false;
  var escaped = false;
  var lastSafeIndex = 0;
  var lastSafeStack = [];

  for (var i = 0; i < cleaned.length; i++) {
    var char = cleaned[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      if (inString) escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}') {
      if (stack[stack.length - 1] === '{') {
        stack.pop();
        lastSafeIndex = i + 1;
        lastSafeStack = [...stack];
      }
      continue;
    }

    if (char === ']') {
      if (stack[stack.length - 1] === '[') {
        stack.pop();
        lastSafeIndex = i + 1;
        lastSafeStack = [...stack];
      }
      continue;
    }

    if (char === ',') {
      lastSafeIndex = i;
      lastSafeStack = [...stack];
    }
  }

  if (lastSafeIndex > 0) {
    var subStr = cleaned.slice(0, lastSafeIndex).trim();
    if (subStr.endsWith(',')) {
      subStr = subStr.slice(0, -1).trim();
    }
    var closing = '';
    for (var j = lastSafeStack.length - 1; j >= 0; j--) {
      closing += (lastSafeStack[j] === '{' ? '}' : ']');
    }
    try {
      return JSON.parse(subStr + closing);
    } catch (err) {
      console.warn("Synapse JSON repair failed at checkpoint:", err.message);
    }
  }

  // If lastSafeIndex didn't work, let's try a simple stack-closing from the end
  if (stack.length > 0) {
    var closing = '';
    for (var j = stack.length - 1; j >= 0; j--) {
      closing += (stack[j] === '{' ? '}' : ']');
    }
    try {
      return JSON.parse(cleaned + closing);
    } catch (err) {
      // Ignore
    }
  }
  return null;
}

function extractFieldsViaRegex(rawText) {
  var result = {
    layer1_identity: {},
    layer2_architecture: {},
    layer3_state: {},
    layer4_facts: {},
    user_preferences: [],
    document_summary: ''
  };

  function getStr(key) {
    var regex = new RegExp('"' + key + '"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"', 'i');
    var match = rawText.match(regex);
    if (match) {
      try {
        return JSON.parse('"' + match[1] + '"');
      } catch (e) {
        return match[1];
      }
    }
    return '';
  }

  function getArr(key) {
    var regex = new RegExp('"' + key + '"\\s*:\\s*\\[([^\\]]*)\\]', 'i');
    var match = rawText.match(regex);
    if (match) {
      var arrayContent = match[1];
      var strRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      var items = [];
      var itemMatch;
      while ((itemMatch = strRegex.exec(arrayContent)) !== null) {
        try {
          items.push(JSON.parse('"' + itemMatch[1] + '"'));
        } catch (e) {
          items.push(itemMatch[1]);
        }
      }
      return items;
    }
    return [];
  }

  result.layer1_identity.project_name = getStr('project_name');
  result.layer1_identity.project_purpose = getStr('project_purpose');
  result.layer1_identity.final_objective = getStr('final_objective');
  result.layer1_identity.project_type = getStr('project_type');

  result.layer2_architecture.major_components = getArr('major_components');
  result.layer2_architecture.system_design = getArr('system_design');
  result.layer2_architecture.technology_stack = getArr('technology_stack');

  result.layer3_state.completed = getArr('completed');
  result.layer3_state.in_progress = getArr('in_progress');
  result.layer3_state.current_step = getStr('current_step');
  result.layer3_state.next_step = getStr('next_step');
  result.layer3_state.blocked_by = getArr('blocked_by');

  result.layer4_facts.hard_facts = getArr('hard_facts');
  result.layer4_facts.user_decisions = getArr('user_decisions');
  result.layer4_facts.current_state = getArr('current_state');
  result.layer4_facts.code_details = getArr('code_details');

  result.user_preferences = getArr('user_preferences');
  result.document_summary = getStr('document_summary');

  return result;
}

async function generateCapsuleHybrid(conversationData) {
  
  // Correctly pull all data from conversationData object
  var messages = conversationData.messages || [];
  var documents = conversationData.documents || [];
  var platform = conversationData.platform || window.location.hostname;
  // Part 3: accept pre-extracted facts
  var storedFacts = conversationData.storedFacts || [];
  var groupedFacts = conversationData.groupedFacts || {};

  var recentMessages = messages.slice(-20);

  var shortTranscript = recentMessages
    .map(function(m) {
      return m.role + ': ' + (m.content || m.text || '').slice(0, 500);
    })
    .join('\n');

  var shortDocSummary = documents.length > 0
    ? documents.map(function(d) {
        return (d.title || 'Untitled') + ': ' + 
          (d.compressedText || '').slice(0, 400);
      }).join('\n')
    : 'No documents attached.';

  // Build facts context string from pre-extracted or inspected facts
  var factsContext = '';
  if (conversationData.inspectedMemory) {
    var im = conversationData.inspectedMemory;
    factsContext = 'USER-VERIFIED PROJECT MEMORY DETAILS (Please preserve and structure these facts and details into the appropriate fields in the output JSON):\n\n';
    
    factsContext += 'LAYER 1 - IDENTITY:\n';
    factsContext += '- Project Name: ' + (im.project_name || '') + '\n';
    factsContext += '- Project Type: ' + (im.project_type || '') + '\n';
    factsContext += '- Project Purpose: ' + (im.project_purpose || '') + '\n';
    factsContext += '- Final Objective: ' + (im.final_objective || '') + '\n\n';

    factsContext += 'LAYER 2 - ARCHITECTURE:\n';
    factsContext += '- Major Components: ' + JSON.stringify(im.major_components) + '\n';
    factsContext += '- System Design: ' + JSON.stringify(im.system_design) + '\n';
    factsContext += '- Tech Stack: ' + JSON.stringify(im.technology_stack) + '\n\n';

    factsContext += 'LAYER 3 - STATE:\n';
    factsContext += '- Completed: ' + JSON.stringify(im.completed) + '\n';
    factsContext += '- In Progress: ' + JSON.stringify(im.in_progress) + '\n';
    factsContext += '- Current Step: ' + (im.current_step || '') + '\n';
    factsContext += '- Next Step: ' + (im.next_step || '') + '\n';
    factsContext += '- Blocked By: ' + JSON.stringify(im.blocked_by) + '\n\n';

    factsContext += 'LAYER 4 - FACTS & DECISIONS:\n';
    var p1Facts = im.facts.filter(f => f.priority === 1).map(f => f.fact);
    var p2Facts = im.facts.filter(f => f.priority === 2).map(f => f.fact);
    var p3Facts = im.facts.filter(f => f.priority === 3).map(f => f.fact);

    factsContext += '- PRIORITY 1 FACTS (CRITICAL - ALWAYS PRESERVE):\n';
    p1Facts.forEach(f => { factsContext += '  * ' + f + '\n'; });
    factsContext += '- PRIORITY 2 FACTS (IMPORTANT):\n';
    p2Facts.forEach(f => { factsContext += '  * ' + f + '\n'; });
    factsContext += '- PRIORITY 3 FACTS (SECONDARY/TEMPORARY):\n';
    p3Facts.forEach(f => { factsContext += '  * ' + f + '\n'; });

    factsContext += '\n- USER DECISIONS:\n';
    if (im.decisions) {
      im.decisions.forEach(d => { factsContext += '  * ' + d + '\n'; });
    }
    factsContext += '\n';
  } else if (storedFacts.length > 0) {
    factsContext = 'PRE-EXTRACTED FACTS (already confirmed from conversation):\n';
    var factTypeLabels = {
      hardware_configuration: 'Hardware/Electronics',
      code_detail: 'Code Details',
      system_configuration: 'System Config',
      user_decision: 'User Decisions',
      system_state: 'Current State',
      study_fact: 'Study Facts'
    };
    Object.keys(groupedFacts).forEach(function(type) {
      var label = factTypeLabels[type] || type;
      factsContext += label + ':\n';
      groupedFacts[type].forEach(function(f) {
        factsContext += '- ' + f + '\n';
      });
      factsContext += '\n';
    });
  }

  var tinyPrompt =
    'You are a technical project memory system.\n' +
    'Analyze this conversation and extract layered memory.\n' +
    'Return raw JSON only. No markdown. No explanation.\n\n' +

    (factsContext ? factsContext + '\n' : '') +

    'CONVERSATION:\n' + shortTranscript + '\n\n' +

    (shortDocSummary !== 'No documents attached.'
      ? 'DOCUMENTS:\n' + shortDocSummary + '\n\n'
      : '') +

    'Extract memory in 4 distinct layers:\n\n' +

    'LAYER 1 — PROJECT IDENTITY (big picture, never changes):\n' +
    'What is the overall project? What is the final goal?\n' +
    'What problem is being solved?\n\n' +

    'LAYER 2 — ARCHITECTURE (components and design):\n' +
    'What are ALL major components, modules, technologies?\n' +
    'What is the overall system design?\n\n' +

    'LAYER 3 — PROJECT STATE (progress tracking):\n' +
    'What has been fully completed?\n' +
    'What is currently being worked on?\n' +
    'What comes next?\n\n' +

    'LAYER 4 — FACTS (specific technical details):\n' +
    'Pin numbers, values, addresses, names, decisions.\n\n' +

    'Return this exact JSON:\n' +
    '{\n' +

    '  "layer1_identity": {\n' +
    '    "project_name": "full descriptive project name",\n' +
    '    "project_purpose": "what this project does when complete",\n' +
    '    "final_objective": "the end goal in one sentence",\n' +
    '    "project_type": "hardware/software/study/research/other"\n' +
    '  },\n' +

    '  "layer2_architecture": {\n' +
    '    "major_components": [\n' +
    '      "every major component — chip, module, library, service"\n' +
    '    ],\n' +
    '    "system_design": [\n' +
    '      "how components connect and interact"\n' +
    '    ],\n' +
    '    "technology_stack": [\n' +
    '      "languages, frameworks, hardware platforms"\n' +
    '    ]\n' +
    '  },\n' +

    '  "layer3_state": {\n' +
    '    "completed": [\n' +
    '      "things fully finished and working"\n' +
    '    ],\n' +
    '    "in_progress": [\n' +
    '      "things currently being worked on"\n' +
    '    ],\n' +
    '    "current_step": "the single specific action happening right now",\n' +
    '    "next_step": "what comes immediately after current step",\n' +
    '    "blocked_by": [\n' +
    '      "anything preventing progress"\n' +
    '    ]\n' +
    '  },\n' +

    '  "layer4_facts": {\n' +
    '    "hard_facts": [\n' +
    '      "specific facts: pin numbers, values, addresses"\n' +
    '    ],\n' +
    '    "user_decisions": [\n' +
    '      "every decision made during the project"\n' +
    '    ],\n' +
    '    "current_state": [\n' +
    '      "what is working, broken, pending"\n' +
    '    ],\n' +
    '    "code_details": [\n' +
    '      "variable names, constants, functions, configs"\n' +
    '    ]\n' +
    '  },\n' +

    '  "user_preferences": ["how user likes to work"],\n' +
    '  "document_summary": "one sentence about documents if any"\n' +
    '}\n\n' +

    'CRITICAL RULES:\n' +
    '- ALWAYS preserve all user-verified Priority 1 facts (such as LED/relay/motor/Arduino/sensor pin assignments, OLED addresses, API keys, database names, and final architecture decisions) in layer4.hard_facts.\n' +
    '- Do not omit or summarize away Priority 1 facts.\n' +
    '- If facts or fields were verified by the user in the metadata details above, output them EXACTLY as provided.\n' +
    '- layer1 must reflect the ENTIRE project not just recent messages\n' +
    '- final_objective is the BIG GOAL not the current step\n' +
    '- current_step is only the immediate action right now\n' +
    '- layer2 must list ALL components mentioned in entire conversation\n' +
    '- layer3.completed must include everything done from start\n' +
    '- layer4 must include ALL facts from entire conversation\n' +
    '- NEVER confuse current_step with final_objective\n' +
    '- BAD final_objective: "connect FULL probe to pin 5/6"\n' +
    '- GOOD final_objective: "build automatic water tank controller"\n' +
    '- Include ALL pre-extracted facts in layer4.hard_facts';


  // STEP 4: Log prompt being sent to Groq
  console.log('=== SYNAPSE DEBUG: PROMPT SENT TO GROQ ===');
  console.log(tinyPrompt);
  console.log('=== END PROMPT ===');
  console.log('Prompt length:', tinyPrompt.length, 'characters');
  console.log('Messages in transcript:', recentMessages.length);
  console.log('Stored facts count:', storedFacts.length);

  var response;
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
          max_tokens: 3000
        })
      }
    );
  } catch (networkErr) {
    throw new Error('Network error: ' + networkErr.message);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid Groq API key. Go to console.groq.com/keys');
    }
    if (response.status === 429) {
      throw new Error('Groq daily limit reached. Resets at midnight.');
    }
    throw new Error('Groq API error: ' + response.status);
  }

  var data = await response.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Empty response from Groq.');
  }

  var rawText = data.choices[0].message.content.trim();

  // Tasks 1 & 2: Log raw Groq response length & raw response
  console.log('=== SYNAPSE DEBUG: GROQ RESPONSE METADATA ===');
  console.log('Raw Groq response length:', rawText.length, 'characters');
  console.log('Finish reason:', data.choices[0].finish_reason);
  if (data.usage) {
    console.log('Usage details:', JSON.stringify(data.usage));
  }
  console.log('=== END METADATA ===');

  console.log('=== SYNAPSE DEBUG: RAW GROQ RESPONSE ===');
  console.log(rawText);
  console.log('=== END RAW RESPONSE ===');

  // Task 4: Verify whether response truncation is occurring
  var finishReason = data.choices[0].finish_reason;
  var isTruncated = (finishReason === 'length');

  // Task 5: Verify whether JSON is being cut off before parse
  var cleaned = rawText
    .replace(/^```json\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  var isJsonCutOff = !cleaned.endsWith('}');

  if (isTruncated) {
    console.error('SYNAPSE WARNING: Groq response was truncated because it exceeded maximum token limit.');
  } else if (isJsonCutOff) {
    console.warn('SYNAPSE WARNING: JSON response was cut off before closing brace.');
  }

  // Task 6: Fallback handling if response exceeds expected size or is truncated
  var aiCapsule;
  var parseMethod = 'standard';
  try {
    aiCapsule = JSON.parse(cleaned);
  } catch (e) {
    console.warn('Synapse: Standard JSON parse failed. Attempting JSON repair fallback...');
    aiCapsule = tryRepairJson(cleaned);
    if (aiCapsule) {
      parseMethod = 'repaired';
    } else {
      console.warn('Synapse: JSON repair failed. Falling back to regex-based field extraction...');
      aiCapsule = extractFieldsViaRegex(cleaned);
      parseMethod = 'regex';
    }
  }

  // Task 3: Log parsed JSON object
  console.log('=== SYNAPSE DEBUG: PARSED AI CAPSULE ===');
  console.log('Parse Method Used:', parseMethod);
  console.log(JSON.stringify(aiCapsule, null, 2));
  console.log('=== END PARSED CAPSULE ===');
  console.log('Layer 1:', JSON.stringify(aiCapsule.layer1_identity));
  console.log('Layer 2:', JSON.stringify(aiCapsule.layer2_architecture));
  console.log('Layer 3:', JSON.stringify(aiCapsule.layer3_state));
  console.log('Layer 4:', JSON.stringify(aiCapsule.layer4_facts));

  // Check for missing layers (only error if we are on standard/repaired and they are missing)
  if (!aiCapsule.layer1_identity) {
    console.error('SYNAPSE ERROR: layer1_identity missing from response');
  }
  if (!aiCapsule.layer3_state) {
    console.error('SYNAPSE ERROR: layer3_state missing from response');
  }

  // Build final layered capsule
  var ai = aiCapsule;
  var l1 = ai.layer1_identity || {};
  var l2 = ai.layer2_architecture || {};
  var l3 = ai.layer3_state || {};
  var l4 = ai.layer4_facts || {};

  return {
    capsule_version: '4.0-layered',
    source_platform: platform,

    // Layer 1 — Identity
    project: l1.project_name || ai.project || 'Unknown Project',
    project_purpose: l1.project_purpose || '',
    final_objective: l1.final_objective || '',
    project_type: l1.project_type || ai.project_type || 'other',

    // Layer 2 — Architecture
    major_components: l2.major_components || [],
    system_design: l2.system_design || [],
    technology_stack: l2.technology_stack || [],

    // Layer 3 — State
    completed: l3.completed || [],
    in_progress: l3.in_progress || [],
    current_step: l3.current_step || '',
    next_step: l3.next_step || '',
    blocked_by: l3.blocked_by || [],

    // Layer 4 — Facts
    hard_facts: l4.hard_facts || [],
    user_decisions: l4.user_decisions || [],
    current_state: l4.current_state || [],
    code_details: l4.code_details || [],

    // Supporting fields
    user_preferences: ai.user_preferences || [],
    stored_facts: storedFacts,
    grouped_facts: groupedFacts,

    recent_context: messages.slice(-30).map(function(m) {
      return {
        role: m.role,
        content: (m.content || m.text || '').slice(0, 600)
      };
    }),

    document_context: {
      documents_present: documents.length > 0,
      document_summary: ai.document_summary || '',
      documents: documents.map(function(d) {
        return {
          title: d.title || 'Untitled',
          type: d.type || 'unknown',
          key_content: (d.compressedText || '').slice(0, 2000)
        };
      })
    },

    // Handoff clearly separates project goal from current step
    handoff:
      'PROJECT: ' + (l1.project_name || 'Unknown') + '. ' +
      'GOAL: ' + (l1.final_objective || 'Unknown') + '. ' +
      'CURRENT STEP: ' + (l3.current_step || 'Unknown') + '. ' +
      'NEXT: ' + (l3.next_step || 'Unknown') + '. ' +
      (documents.length > 0
        ? documents.length + ' documents in memory. '
        : '') +
      'Continue from current step toward final objective.'
  };
}

function saveCapsuleToFirestore(capsule) {
  if (isChromeContextValid()) {
    chrome.runtime.sendMessage({ action: 'saveCapsule', capsule: capsule });
    console.log('Synapse: Firestore save message sent for', capsule.id);
  }
}

async function extractAndStorePDF(file, projectName) {
  try {
    const docMemory = await promiseWithTimeout((async () => {
      var pdfData = await extractPDFTextLocally(file);
      var rawText = (typeof pdfData === 'object' && pdfData !== null) ? pdfData.text : pdfData;
      var pageCount = (typeof pdfData === 'object' && pdfData !== null) ? pdfData.pageCount : 1;
      if (!rawText || rawText.length < 50) return null;

      // Compress to key concepts only
      var compressed = compressTextLocally(rawText, 4000);

      let summary = "";
      let concepts = [];
      let facts = [];
      if (isChromeContextValid()) {
        try {
          const response = await promiseWithTimeout(new Promise(resolve => {
            chrome.runtime.sendMessage({
              action: 'processPDF',
              filename: file.name,
              text: rawText,
              pageCount: pageCount,
              projectName: projectName || "Default Project"
            }, resolve);
          }), 12000, new Error("Background process timeout"));
          if (response && response.success && response.doc) {
            summary = response.doc.summary;
            concepts = response.doc.concepts;
            facts = response.doc.facts || [];
          }
        } catch (err) {
          console.warn('Failed to summarize PDF in background:', err);
        }
      }

      var docMem = {
        title: file.name,
        filename: file.name,
        type: 'pdf',
        rawLength: rawText.length,
        compressedText: compressed,
        charCount: rawText.length,
        extractedAt: new Date().toISOString(),
        source: 'intercepted',
        summary: summary,
        concepts: concepts,
        facts: facts,
        pageCount: pageCount,
        projectId: (projectName || "Default Project").toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      };

      // Save to Firestore for permanent memory (flat capsule format)
      saveCapsuleToFirestore({ 
        id: 'doc_' + Date.now(),
        project: projectName || file.name,
        topics: [],
        document_context: {
          documents_present: true,
          documents: [docMem]
        }
      });

      return docMem;
    })(), 15000, new Error("PDF extraction timeout"));

    return docMemory;

  } catch(e) {
    console.warn('PDF extraction failed or timed out:', e);
    showNotification("PDF could not be processed.", "error");
    return null;
  }
}

async function handleImageMemory(file) {
  var imageMemory = {
    title: file.name,
    type: file.type,
    size: file.size,
    capturedAt: new Date().toISOString(),
    description: 'Image: ' + file.name + 
      ' (' + Math.round(file.size/1024) + 'KB, ' + 
      file.type + ')',
    note: 'Visual content — ask user to re-share if needed'
  };

  // Store in intercepted docs
  safeStorageGet(['synapse_intercepted'], function(result) {
    var intercepted = result.synapse_intercepted || {};
    var key = window.location.href;
    if (!intercepted[key]) intercepted[key] = [];
    intercepted[key].push({
      title: file.name,
      type: file.type,
      compressedText: imageMemory.description,
      charCount: imageMemory.description.length,
      isImage: true,
      capturedAt: imageMemory.capturedAt,
      source: 'intercepted'
    });
    safeStorageSet({ synapse_intercepted: intercepted });
  });
}

function updateDebugPanel(file) {
  let panel = document.getElementById('synapse-debug-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'synapse-debug-panel';
    panel.style.cssText = 'position:fixed; top:20px; left:20px; z-index:999999; background:rgba(0,0,0,0.85); color:#00ffcc; padding:15px; border-radius:8px; border:1px solid #00ffcc; font-family:monospace; font-size:12px; pointer-events:none;';
    panel.innerHTML = '<strong>Detected Files:</strong><div id="synapse-debug-files"></div>';
    document.body.appendChild(panel);
  }
  const fileList = document.getElementById('synapse-debug-files');
  const sizeKB = Math.round(file.size / 1024);
  fileList.innerHTML += `<div>- ${file.name} (${file.type || 'unknown'}, ${sizeKB}KB)</div>`;
}

async function handleInterceptedFile(file) {
  try {
    console.log('🔵 Synapse intercepted:', file.name);
    console.log("File detected:", file.name);
    console.log("File type:", file.type);
    
    updateDebugPanel(file);
    
    let extractedText = '';
    
    // Extract recent messages to get project name
    const conversation = extractRecentMessages();
    const messages = conversation.map(c => ({ role: c.role, content: c.text || c.content || '' }));
    const projectName = generateSmartTitle(messages) || "Default Project";
    
    if (file.name.endsWith('.pdf') || file.type === 'application/pdf') {
      const docMemory = await extractAndStorePDF(file, projectName);
      if (docMemory) {
        extractedText = docMemory.compressedText || 'PDF extraction failed. Document reference only.';
      } else {
        extractedText = 'PDF extraction failed. Document reference only.';
      }
    } else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
      extractedText = await extractDOCXTextLocally(file);
    } else if (file.name.endsWith('.pptx') || file.name.endsWith('.ppt')) {
      extractedText = await extractPPTXText(file);
    } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      extractedText = await file.text();
    } else if (file.type.startsWith('image/')) {
      await handleImageMemory(file);
      return;
    }

    if (!extractedText || extractedText.trim().length < 10) {
      console.warn('Synapse: Minimal text extracted from', file.name);
      extractedText = 'Document text empty or unreadable. Reference only.';
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
        filename: file.name,
        type: file.type || 'unknown',
        filetype: file.type || 'unknown',
        compressedText: compressTextLocally(extractedText, 3000),
        charCount: extractedText.length,
        capturedAt: new Date().toISOString(),
        uploadedAt: new Date().toISOString(),
        source: 'intercepted'
      });

      safeStorageSet({ synapse_intercepted: allIntercepted });
      console.log('✅ Synapse saved', file.name, 'for conversation:', conversationKey);
      console.log("Document added to memory");
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

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateMeaningfulMetadata(projectName, projectType, allText) {
  var purpose = "";
  var objective = "";
  
  var nameLower = (projectName || "").toLowerCase();
  
  if (nameLower.includes("oop") || nameLower.includes("object-oriented") || nameLower.includes("object oriented")) {
    purpose = "Prepare for Object-Oriented Programming exam covering encapsulation, classes, objects, constructors and inheritance.";
    objective = "Achieve complete exam readiness through practice questions, code exercises and concept review.";
  } else if (projectType === "study" || nameLower.includes("study") || nameLower.includes("prep") || nameLower.includes("exam") || nameLower.includes("quiz")) {
    purpose = "Prepare for academic topics covering key concepts, lectures, and course materials for " + (projectName || "study preparation") + ".";
    objective = "Master all course objectives and achieve exam readiness through thorough review and study exercises.";
  } else if (projectType === "hardware" || nameLower.includes("arduino") || nameLower.includes("circuit") || nameLower.includes("motor")) {
    purpose = "Design, assemble, and test a hardware prototype using microcontrollers, sensors, and electronic components for " + (projectName || "hardware project") + ".";
    objective = "Build a fully operational hardware system integrated with control software and electronic peripherals.";
  } else if (projectType === "programming" || projectType === "software" || nameLower.includes("app") || nameLower.includes("code") || nameLower.includes("software")) {
    purpose = "Develop and deploy a structured software application incorporating clean code, algorithms, and modular design patterns for " + (projectName || "software project") + ".";
    objective = "Deliver a fully functional software application meeting design specifications and programming best practices.";
  } else {
    purpose = "Develop a comprehensive " + (projectType || "software") + " project to address key requirements and features for " + (projectName || "the target goal") + ".";
    objective = "Build, verify, and complete all milestones for the project to ensure a robust and functional final implementation.";
  }
  
  return { purpose: purpose, objective: objective };
}

function isGenericText(text) {
  if (!text) return true;
  var val = text.toLowerCase().trim();
  if (val.startsWith("develop the ") && val.endsWith(".")) return true;
  if (val.startsWith("develop a ") && val.includes("project")) return true;
  if (val.startsWith("a fully functional ") && val.endsWith("meeting all requirements.")) return true;
  if (val.length < 20) return true;
  return false;
}

function extractHeuristicMetadata(messages, storedFacts) {
  var allText = messages.map(m => m.content || '').join(' ');
  var projectName = generateSmartTitle(messages);
  
  // Issue 3: Project Type Detection using keyword scoring
  var score = {
    hardware: 0,
    programming: 0,
    study: 0
  };

  var hwRegexes = [/arduino/i, /relay/i, /sensor/i, /breadboard/i, /cd4011/i, /motor/i, /circuit/i];
  var progRegexes = [/c\+\+/i, /java\b/i, /python/i, /\boop\b/i, /\bclass\b/i, /\bobject\b/i, /constructor/i, /algorithm/i];
  var studyRegexes = [/exam/i, /quiz/i, /assignment/i, /lecture/i, /slides/i, /week[_-]?1\b/i, /week[_-]?2\b/i, /week[_-]?3\b/i];

  hwRegexes.forEach(function(re) {
    var matches = allText.match(re);
    if (matches) score.hardware += matches.length;
  });
  progRegexes.forEach(function(re) {
    var matches = allText.match(re);
    if (matches) score.programming += matches.length;
  });
  studyRegexes.forEach(function(re) {
    var matches = allText.match(re);
    if (matches) score.study += matches.length;
  });

  var projectType = 'software';
  if (score.hardware > 0 || score.programming > 0 || score.study > 0) {
    var maxScore = Math.max(score.hardware, score.programming, score.study);
    if (maxScore === score.hardware) {
      projectType = 'hardware';
    } else if (maxScore === score.programming) {
      projectType = 'programming';
    } else {
      projectType = 'study';
    }
  } else {
    // Basic fallback check
    if (/pin|circuit|led|relay|arduino|esp32|motor|wiring|sensor|volt|resistor|breadboard|cd4011|ic\b|probe/i.test(allText)) {
      projectType = 'hardware';
    } else if (/paper|study|read|learn|concept|exam/i.test(allText)) {
      projectType = 'study';
    } else if (/research|paper|scientific/i.test(allText)) {
      projectType = 'research';
    }
  }
  
  var projectPurpose = '';
  var finalObjective = '';

  var designMatch = allText.match(/(?:designing|building|creating|making|developing|implementing|working on)\s+(?:a|an)?\s*([^\n\.]{10,100})/i);
  if (designMatch && !hasForbiddenText(designMatch[1])) {
    var cand = 'Design and build ' + designMatch[1].trim();
    if (validateProjectPurpose(cand)) {
      projectPurpose = cand;
    }
  }

  if (!projectPurpose) {
    var wantMatch = allText.match(/(?:want to|need to|trying to|aiming to|plan to)\s+([^\n\.]{10,100})/i);
    if (wantMatch && !hasForbiddenText(wantMatch[1])) {
      var cand = wantMatch[1].trim();
      cand = cand.charAt(0).toUpperCase() + cand.slice(1);
      if (validateProjectPurpose(cand)) {
        projectPurpose = cand;
      }
    }
  }

  // Issue 4: Generate meaningful metadata if generic or empty
  var meaningful = generateMeaningfulMetadata(projectName, projectType, allText);

  if (!projectPurpose || isGenericText(projectPurpose)) {
    projectPurpose = meaningful.purpose;
  }

  var goalMatch = allText.match(/(?:final goal|objective|end goal|target is|complete system is|complete design is)\s*(?:is|=)?\s*([^\n\.]{15,120})/i);
  if (goalMatch && !hasForbiddenText(goalMatch[1])) {
    var cand = goalMatch[1].trim();
    if (validateProjectPurpose(cand)) {
      finalObjective = cand;
    }
  }

  if (!finalObjective || isGenericText(finalObjective)) {
    finalObjective = meaningful.objective;
  }
  
  var majorComponents = [];
  var techStack = [];
  var systemDesign = [];
  
  var techKeywords = ['javascript', 'python', 'c++', 'arduino', 'esp32', 'react', 'next.js', 'html', 'css', 'fastapi', 'flask', 'sqlite', 'mongodb', 'firebase', 'rust'];
  techKeywords.forEach(function(kw) {
    try {
      var escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var prefix = /^\w/.test(kw) ? '\\b' : '(?:^|\\s|[.,;:!])';
      var suffix = /\w$/.test(kw) ? '\\b' : '(?:$|\\s|[.,;:!])';
      var regex = new RegExp(prefix + escaped + suffix, 'i');
      if (regex.test(allText)) {
        techStack.push(kw.charAt(0).toUpperCase() + kw.slice(1));
      }
    } catch(e) {
      console.warn("Synapse: Error building regex for keyword: " + kw, e);
    }
  });
  if (techStack.length === 0) techStack.push('Vanilla JS');
  
  var componentsKeywords = ['led', 'relay', 'motor', 'oled', 'lcd', 'sensor', 'dht22', 'servo', 'pump', 'button', 'switch'];
  componentsKeywords.forEach(function(kw) {
    var regex = new RegExp('\\b' + kw + 's?\\b', 'i');
    if (regex.test(allText)) {
      majorComponents.push(kw.toUpperCase());
    }
  });
  if (majorComponents.length === 0) majorComponents.push('General Controller');
  
  systemDesign.push('Components connected directly to controller board.');

  var completed = [];
  var inProgress = [];
  var currentStep = extractCurrentGoal(messages);
  var nextStep = 'Next logical development iteration.';
  var blockedBy = [];
  
  var unresolved = extractUnresolvedIssues(messages);
  if (unresolved.length > 0) {
    blockedBy = unresolved;
  }
  
  var stateMatch = allText.match(/(?:completed|finished|done with)\s+([^.\n]{5,50})/gi);
  if (stateMatch) {
    stateMatch.forEach(function(m) {
      completed.push(m.replace(/completed|finished|done with/i, '').trim());
    });
  }
  if (completed.length === 0) completed.push('Setup initial workspace');
  
  var workingMatch = allText.match(/(?:working on|writing|debugging|fixing)\s+([^.\n]{5,50})/gi);
  if (workingMatch) {
    workingMatch.forEach(function(m) {
      inProgress.push(m.trim());
    });
  }
  if (inProgress.length === 0) inProgress.push(currentStep);

  return {
    project_name: projectName,
    project_type: projectType,
    project_purpose: projectPurpose,
    final_objective: finalObjective,
    major_components: majorComponents,
    system_design: systemDesign,
    technology_stack: techStack,
    completed: completed,
    in_progress: inProgress,
    current_step: currentStep,
    next_step: nextStep,
    blocked_by: blockedBy
  };
}

function showMemoryInspector(initialData, onConfirm, onCancel) {
  var backdrop = document.getElementById("synapse-inspector-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "synapse-inspector-backdrop";
    backdrop.className = "synapse-inspector-backdrop";
    document.body.appendChild(backdrop);
  }
  
  var h = initialData.heuristic;
  var facts = initialData.storedFacts.map(function(f) {
    var p = f.priority || calculateFactImportance(f.fact, f.type);
    return {
      fact: f.fact,
      type: f.type,
      priority: p
    };
  });
  
  var decisions = facts.filter(f => f.type === 'user_decision').map(f => f.fact);
  facts = facts.filter(f => f.type !== 'user_decision');
  
  backdrop.innerHTML = `
    <div class="synapse-inspector-modal">
      <div class="synapse-inspector-header">
        <div>
          <div class="synapse-inspector-title">Synapse Memory Inspector</div>
          <div class="synapse-inspector-subtitle">Verify and edit extracted memory before generating the capsule</div>
        </div>
        <button class="inspector-btn-cancel" id="inspector-close-btn" style="padding: 4px 8px; font-size: 14px;">×</button>
      </div>
      
      <div class="synapse-inspector-body">
        <div class="synapse-inspector-sidebar">
          <button class="synapse-inspector-tab-btn active" data-tab="identity">
            <span>Identity</span>
          </button>
          <button class="synapse-inspector-tab-btn" data-tab="architecture">
            <span>Architecture</span>
          </button>
          <button class="synapse-inspector-tab-btn" data-tab="state">
            <span>State</span>
          </button>
          <button class="synapse-inspector-tab-btn" data-tab="facts">
            <span>Facts</span>
            <span class="inspector-badge-count" id="badge-facts-count">${facts.length}</span>
          </button>
          <button class="synapse-inspector-tab-btn" data-tab="decisions">
            <span>Decisions</span>
            <span class="inspector-badge-count" id="badge-decisions-count">${decisions.length}</span>
          </button>
          <button class="synapse-inspector-tab-btn" data-tab="documents">
            <span>Documents</span>
            <span class="inspector-badge-count" id="badge-documents-count">${initialData.documents ? initialData.documents.length : 0}</span>
          </button>
        </div>
        
        <div class="synapse-inspector-content active" id="tab-identity">
          <div class="inspector-form-group">
            <label class="inspector-label">Project Name</label>
            <input type="text" id="ins-project-name" class="inspector-input" value="${escapeHtml(h.project_name)}">
          </div>
          <div class="inspector-form-group">
            <label class="inspector-label">Project Type</label>
            <select id="ins-project-type" class="inspector-select">
              <option value="software" ${h.project_type === 'software' ? 'selected' : ''}>Software</option>
              <option value="hardware" ${h.project_type === 'hardware' ? 'selected' : ''}>Hardware</option>
              <option value="study" ${h.project_type === 'study' ? 'selected' : ''}>Study</option>
              <option value="research" ${h.project_type === 'research' ? 'selected' : ''}>Research</option>
              <option value="other" ${h.project_type === 'other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="inspector-form-group">
            <label class="inspector-label">Project Purpose</label>
            <textarea id="ins-project-purpose" class="inspector-textarea" rows="4">${escapeHtml(h.project_purpose)}</textarea>
          </div>
          <div class="inspector-form-group">
            <label class="inspector-label">Final Objective</label>
            <textarea id="ins-final-objective" class="inspector-textarea" rows="3">${escapeHtml(h.final_objective)}</textarea>
          </div>
        </div>
        
        <div class="synapse-inspector-content" id="tab-architecture">
          <div class="inspector-form-group">
            <label class="inspector-label">Major Components (comma-separated)</label>
            <textarea id="ins-major-components" class="inspector-textarea" rows="3">${escapeHtml(h.major_components.join(', '))}</textarea>
          </div>
          <div class="inspector-form-group">
            <label class="inspector-label">System Design (comma-separated)</label>
            <textarea id="ins-system-design" class="inspector-textarea" rows="3">${escapeHtml(h.system_design.join(', '))}</textarea>
          </div>
          <div class="inspector-form-group">
            <label class="inspector-label">Technology Stack (comma-separated)</label>
            <textarea id="ins-tech-stack" class="inspector-textarea" rows="3">${escapeHtml(h.technology_stack.join(', '))}</textarea>
          </div>
        </div>
        
        <div class="synapse-inspector-content" id="tab-state">
          <div class="inspector-form-group">
            <label class="inspector-label">Completed Tasks (comma-separated)</label>
            <textarea id="ins-completed" class="inspector-textarea" rows="2">${escapeHtml(h.completed.join(', '))}</textarea>
          </div>
          <div class="inspector-form-group">
            <label class="inspector-label">In Progress (comma-separated)</label>
            <textarea id="ins-in-progress" class="inspector-textarea" rows="2">${escapeHtml(h.in_progress.join(', '))}</textarea>
          </div>
          <div class="inspector-form-group">
            <label class="inspector-label">Current Step</label>
            <input type="text" id="ins-current-step" class="inspector-input" value="${escapeHtml(h.current_step)}">
          </div>
          <div class="inspector-form-group">
            <label class="inspector-label">Next Step</label>
            <input type="text" id="ins-next-step" class="inspector-input" value="${escapeHtml(h.next_step)}">
          </div>
          <div class="inspector-form-group">
            <label class="inspector-label">Blocked By (comma-separated)</label>
            <input type="text" id="ins-blocked-by" class="inspector-input" value="${escapeHtml(h.blocked_by.join(', '))}">
          </div>
        </div>
        
        <div class="synapse-inspector-content" id="tab-facts">
          <div style="font-size: 11px; color: #9ca3af; margin-bottom: 8px;">
            Critical facts like <b>LED</b>, <b>relay</b>, <b>motor</b>, <b>Arduino pin assignments</b>, and <b>OLED addresses</b> are automatically scored as Priority 1 (green).
          </div>
          <div class="inspector-items-container" id="facts-list-container">
            <!-- Render facts dynamically -->
          </div>
          <button class="inspector-btn-add" id="inspector-add-fact-btn">+ Add Fact</button>
        </div>
        
        <div class="synapse-inspector-content" id="tab-decisions">
          <div style="font-size: 11px; color: #9ca3af; margin-bottom: 8px;">
            Decisions made during development (e.g. choice of components or library configurations).
          </div>
          <div class="inspector-items-container" id="decisions-list-container">
            <!-- Render decisions dynamically -->
          </div>
          <button class="inspector-btn-add" id="inspector-add-decision-btn">+ Add Decision</button>
        </div>

        <div class="synapse-inspector-content" id="tab-documents">
          <div style="font-size: 11px; color: #9ca3af; margin-bottom: 12px;">
            Attached/intercepted documents and extracted key concepts.
          </div>
          <div class="inspector-items-container" id="documents-list-container" style="display:flex; flex-direction:column; gap:16px; overflow-y:auto; max-height:280px;">
            ${(initialData.documents || []).map(function(d) {
              const name = d.title || d.filename || 'Untitled';
              const fileConcepts = d.concepts || [];
              const fileFacts = d.facts || [];
              const summary = d.summary || "No summary generated.";
              return `
                <div class="inspector-document-item" style="font-family: 'Outfit', sans-serif; margin-bottom: 20px; color: #f3f4f6; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 8px;">
                  <div style="font-weight: 700; font-size: 14px; color: #60a5fa; margin-bottom: 4px;">📄 ${escapeHtml(name)}</div>
                  <div style="font-weight: 600; font-size: 11px; color: #9ca3af; margin-bottom: 12px; text-transform: uppercase;">Type: ${escapeHtml(d.type || d.filetype || 'unknown')}</div>
                  
                  <div style="font-weight: 600; font-size: 12px; color: #9ca3af; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Summary:</div>
                  <div style="font-size: 13px; color: #d1d5db; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(summary)}</div>
                </div>
              `;
            }).join('') || '<div style="font-size:12px; color:#6b7280;">No documents attached to this conversation.</div>'}
          </div>
        </div>
      </div>
      
      <div class="synapse-inspector-footer">
        <button class="inspector-btn-cancel" id="inspector-cancel-btn">Cancel</button>
        <button class="inspector-btn-confirm" id="inspector-generate-btn">Confirm & Generate Capsule</button>
      </div>
    </div>
  `;
  
  backdrop.classList.add("show");
  
  var tabButtons = backdrop.querySelectorAll(".synapse-inspector-tab-btn");
  var contents = backdrop.querySelectorAll(".synapse-inspector-content");
  tabButtons.forEach(function(btn) {
    btn.addEventListener("click", function() {
      tabButtons.forEach(b => b.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      var tabId = btn.getAttribute("data-tab");
      backdrop.querySelector("#tab-" + tabId).classList.add("active");
    });
  });
  
  function closeInspector() {
    backdrop.classList.remove("show");
    window.synapseIsGenerating = false;
    const btn = document.getElementById("synapse-input-btn");
    if (btn) btn.classList.remove('animating');
    if (onCancel) onCancel();
  }
  backdrop.querySelector("#inspector-close-btn").addEventListener("click", closeInspector);
  backdrop.querySelector("#inspector-cancel-btn").addEventListener("click", closeInspector);
  
  function renderFactsList() {
    var container = backdrop.querySelector("#facts-list-container");
    container.innerHTML = "";
    
    // Sort facts: Priority 1 first, then 2, then 3
    facts.sort(function(a, b) {
      return a.priority - b.priority;
    });
    
    backdrop.querySelector("#badge-facts-count").textContent = facts.length;
    
    if (facts.length === 0) {
      container.innerHTML = `<div style="font-size: 12px; color: #6b7280; padding: 20px; text-align: center;">No facts detected. Click "+ Add Fact" to insert one.</div>`;
      return;
    }
    
    facts.forEach(function(f, idx) {
      var row = document.createElement("div");
      row.className = "inspector-fact-row p" + f.priority;
      row.innerHTML = `
        <input type="text" class="inspector-input ins-fact-input" value="${escapeHtml(f.fact)}" style="flex: 1;">
        <select class="inspector-fact-priority ins-fact-priority">
          <option value="1" ${f.priority === 1 ? 'selected' : ''}>P1 - Critical</option>
          <option value="2" ${f.priority === 2 ? 'selected' : ''}>P2 - Important</option>
          <option value="3" ${f.priority === 3 ? 'selected' : ''}>P3 - Low/Temp</option>
        </select>
        <button class="inspector-btn-delete ins-fact-delete">×</button>
      `;
      
      row.querySelector(".ins-fact-input").addEventListener("change", function(e) {
        facts[idx].fact = e.target.value.trim();
        var newP = calculateFactImportance(facts[idx].fact, facts[idx].type);
        facts[idx].priority = newP;
        renderFactsList();
      });
      
      row.querySelector(".ins-fact-priority").addEventListener("change", function(e) {
        facts[idx].priority = parseInt(e.target.value);
        renderFactsList();
      });
      
      row.querySelector(".ins-fact-delete").addEventListener("click", function() {
        facts.splice(idx, 1);
        renderFactsList();
      });
      
      container.appendChild(row);
    });
  }
  
  function renderDecisionsList() {
    var container = backdrop.querySelector("#decisions-list-container");
    container.innerHTML = "";
    backdrop.querySelector("#badge-decisions-count").textContent = decisions.length;
    
    if (decisions.length === 0) {
      container.innerHTML = `<div style="font-size: 12px; color: #6b7280; padding: 20px; text-align: center;">No decisions detected. Click "+ Add Decision" to insert one.</div>`;
      return;
    }
    
    decisions.forEach(function(d, idx) {
      var row = document.createElement("div");
      row.className = "inspector-decision-row";
      row.innerHTML = `
        <input type="text" class="inspector-input ins-decision-input" value="${escapeHtml(d)}" style="flex: 1;">
        <button class="inspector-btn-delete ins-decision-delete">×</button>
      `;
      
      row.querySelector(".ins-decision-input").addEventListener("change", function(e) {
        decisions[idx] = e.target.value.trim();
      });
      
      row.querySelector(".ins-decision-delete").addEventListener("click", function() {
        decisions.splice(idx, 1);
        renderDecisionsList();
      });
      
      container.appendChild(row);
    });
  }
  
  backdrop.querySelector("#inspector-add-fact-btn").addEventListener("click", function() {
    facts.push({
      fact: "New pin connection or mapping fact",
      type: "hardware_configuration",
      priority: 1
    });
    renderFactsList();
  });
  
  backdrop.querySelector("#inspector-add-decision-btn").addEventListener("click", function() {
    decisions.push("New decision (e.g. decided to use I2C display)");
    renderDecisionsList();
  });
  
  renderFactsList();
  renderDecisionsList();
  
  backdrop.querySelector("#inspector-generate-btn").addEventListener("click", function() {
    var insName = backdrop.querySelector("#ins-project-name").value.trim();
    var insType = backdrop.querySelector("#ins-project-type").value;
    var insPurpose = backdrop.querySelector("#ins-project-purpose").value.trim();
    var insFinalObj = backdrop.querySelector("#ins-final-objective").value.trim();
    
    var insComponents = backdrop.querySelector("#ins-major-components").value.split(',').map(s => s.trim()).filter(Boolean);
    var insDesign = backdrop.querySelector("#ins-system-design").value.split(',').map(s => s.trim()).filter(Boolean);
    var insTech = backdrop.querySelector("#ins-tech-stack").value.split(',').map(s => s.trim()).filter(Boolean);
    
    var insCompleted = backdrop.querySelector("#ins-completed").value.split(',').map(s => s.trim()).filter(Boolean);
    var insInProgress = backdrop.querySelector("#ins-in-progress").value.split(',').map(s => s.trim()).filter(Boolean);
    var insCurrentStep = backdrop.querySelector("#ins-current-step").value.trim();
    var insNextStep = backdrop.querySelector("#ins-next-step").value.trim();
    var insBlockedBy = backdrop.querySelector("#ins-blocked-by").value.split(',').map(s => s.trim()).filter(Boolean);
    
    var editedMemory = {
      project_name: insName,
      project_type: insType,
      project_purpose: insPurpose,
      final_objective: insFinalObj,
      major_components: insComponents,
      system_design: insDesign,
      technology_stack: insTech,
      completed: insCompleted,
      in_progress: insInProgress,
      current_step: insCurrentStep,
      next_step: insNextStep,
      blocked_by: insBlockedBy,
      facts: facts,
      decisions: decisions
    };
    
    backdrop.classList.remove("show");
    onConfirm(editedMemory);
  });
}

async function generateCapsule(selectedDocs = null) {
    if (window.synapseIsGenerating) {
        console.warn("Synapse: Generation blocked. Already in progress.");
        return;
    }
    
    // Add emergency reset
    window.synapseResetGeneration = () => {
        window.synapseIsGenerating = false;
        const btn = document.getElementById("synapse-input-btn");
        if (btn) btn.classList.remove('animating');
        var loadingToast = document.getElementById("synapse-loading-toast");
        if (loadingToast) loadingToast.style.transform = 'translateX(125%)';
        console.log("Synapse: Generation emergency reset executed.");
    };

    console.log("Generation started");

    const now = Date.now();
    if (now - window.synapseLastGenerationTime < 10000) {
        showNotification("Please wait 10 seconds between generations.", "error");
        return;
    }

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
        window.synapseIsGenerating = true;
        window.synapseLastGenerationTime = now;

        if (loadingTextSpan) {
            loadingTextSpan.textContent = "Loading memory from Firestore...";
        }

        if (loadingTextSpan) {
            loadingTextSpan.textContent = "Extracting conversation context...";
        }

        // 1. Extract the current conversation on the page
        const conversation = extractRecentMessages();
        const messages = conversation.map(c => ({ role: c.role, content: c.text || c.content || '' }));
        
        // 2. Extract facts from the conversation (both stored and freshly scanned)
        console.log("[DEBUG] Awaiting loadStoredFacts...");
        const storedConversationFacts = await loadStoredFacts();
        console.log("[DEBUG] Completed loadStoredFacts.");

        const fullConversationText = conversation.map(function(m) {
          return (m.role || 'user') + ': ' + (m.content || m.text || '');
        }).join('\n\n');
        const freshConversationFacts = extractFactsFromText(fullConversationText);
        
        const conversationFacts = [...storedConversationFacts];
        freshConversationFacts.forEach(f => {
            if (!conversationFacts.some(existing => existing.fact.toLowerCase().trim() === f.fact.toLowerCase().trim())) {
                conversationFacts.push(f);
            }
        });
        
        // 3. Extract heuristic metadata from the page
        const pageHeuristic = extractHeuristicMetadata(messages, conversationFacts);

        if (loadingTextSpan) {
            loadingTextSpan.textContent = "Loading memory from Firestore...";
        }
        
        // 4. Fetch the project memory from Firestore (using the heuristically-extracted project name)
        let projectMemory = { success: false, project: {}, state: {}, facts: [], decisions: [], documents: [] };
        try {
            console.log("[DEBUG] Awaiting loadProjectMemory from Firestore for project:", pageHeuristic.project_name);
            projectMemory = await new Promise((resolve, reject) => {
                const firestoreTimeout = setTimeout(() => {
                    reject(new Error("Firestore load timeout"));
                }, 5000);
                
                chrome.runtime.sendMessage({ 
                    action: "loadProjectMemory", 
                    projectName: pageHeuristic.project_name 
                }, (response) => {
                    clearTimeout(firestoreTimeout);
                    if (response && response.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response ? response.error : "Failed to load project memory from Firestore"));
                    }
                });
            });
            console.log("[DEBUG] Completed loadProjectMemory from Firestore.");
        } catch (err) {
            console.error("Synapse: Failed to load project memory, continuing with local page memory:", err);
            showNotification("Firestore offline. Using local page memory.", "warning");
        }

        // 5. Merge Firestore memory with locally-extracted page details
        const projectDoc = projectMemory.project || {};
        const stateDoc = projectMemory.state || {};
        
        const pageProjectName = pageHeuristic.project_name;
        const isNameValid = validateProjectName(pageProjectName);
        
        let finalProjectName = "";
        if (projectDoc.projectName && projectDoc.projectName !== "Default Project") {
            finalProjectName = projectDoc.projectName;
        } else if (isNameValid) {
            finalProjectName = pageProjectName;
        } else {
            finalProjectName = "Default Project";
        }
        
        let finalPurpose = "";
        if (projectDoc.purpose && projectDoc.purpose.trim().length > 10) {
            finalPurpose = projectDoc.purpose.trim();
        } else if (pageHeuristic.project_purpose && pageHeuristic.project_purpose.trim().length > 10 && !hasForbiddenText(pageHeuristic.project_purpose)) {
            finalPurpose = pageHeuristic.project_purpose.trim();
        } else {
            finalPurpose = "Develop a " + (projectDoc.projectType || pageHeuristic.project_type || "software") + " project.";
        }
        
        let finalObjective = "";
        if (projectDoc.finalObjective && projectDoc.finalObjective.trim().length > 10) {
            finalObjective = projectDoc.finalObjective.trim();
        } else if (pageHeuristic.final_objective && pageHeuristic.final_objective.trim().length > 10 && !hasForbiddenText(pageHeuristic.final_objective)) {
            finalObjective = pageHeuristic.final_objective.trim();
        } else {
            finalObjective = finalPurpose;
        }

        const mergedHeuristic = {
            project_name: finalProjectName,
            project_type: projectDoc.projectType || pageHeuristic.project_type || "software",
            project_purpose: finalPurpose,
            final_objective: finalObjective,
            major_components: Array.from(new Set([
                ...(projectDoc.major_components || []),
                ...(pageHeuristic.major_components || [])
            ])),
            system_design: Array.from(new Set([
                ...(projectDoc.system_design || []),
                ...(pageHeuristic.system_design || [])
            ])),
            technology_stack: Array.from(new Set([
                ...(projectDoc.technology_stack || []),
                ...(pageHeuristic.technology_stack || [])
            ])),
            completed: Array.from(new Set([
                ...(stateDoc.completed || []),
                ...(pageHeuristic.completed || [])
            ])),
            in_progress: Array.from(new Set([
                ...(stateDoc.inProgress || []),
                ...(pageHeuristic.in_progress || [])
            ])),
            current_step: stateDoc.currentStep || pageHeuristic.current_step || "",
            next_step: stateDoc.nextStep || pageHeuristic.next_step || "",
            blocked_by: Array.from(new Set([
                ...(stateDoc.blockedBy || []),
                ...(pageHeuristic.blocked_by || [])
            ]))
        };

        // 6. Merge facts and decisions
        const mergedFactsMap = new Map();
        
        // Add Firestore facts
        (projectMemory.facts || []).forEach(f => {
            const val = (f.fact || f.value || f).trim();
            if (val) {
                mergedFactsMap.set(val.toLowerCase(), {
                    fact: val,
                    type: f.type || "other",
                    priority: f.priority || 2
                });
            }
        });
        
        // Add/merge local conversation facts
        conversationFacts.forEach(f => {
            const val = (f.fact || f.value || f).trim();
            if (val) {
                const key = val.toLowerCase();
                if (!mergedFactsMap.has(key)) {
                    mergedFactsMap.set(key, {
                        fact: val,
                        type: f.type || "other",
                        priority: f.priority || 2
                    });
                } else {
                    const existing = mergedFactsMap.get(key);
                    if (f.priority < existing.priority) {
                        existing.priority = f.priority;
                    }
                }
            }
        });
        
        // Add Firestore decisions as virtual facts
        (projectMemory.decisions || []).forEach(d => {
            if (typeof d === 'string' && d.trim()) {
                const val = d.trim();
                mergedFactsMap.set(val.toLowerCase(), {
                    fact: val,
                    type: 'user_decision',
                    priority: 2
                });
            }
        });
        
        const combinedFacts = Array.from(mergedFactsMap.values());
        
        // Load page-intercepted documents and Firestore documents
        const currentConversationKey = window.location.href;
        console.log("[DEBUG] Awaiting safeStorageGet for synapse_intercepted...");
        const interceptedResult = await new Promise(resolve => {
            safeStorageGet(['synapse_intercepted'], resolve);
        });
        console.log("[DEBUG] Completed safeStorageGet for synapse_intercepted.");

        const allIntercepted = interceptedResult.synapse_intercepted || {};
        const thisConversationDocs = [];
        Object.keys(allIntercepted).forEach(key => {
            if (Array.isArray(allIntercepted[key])) {
                thisConversationDocs.push(...allIntercepted[key]);
            }
        });
        
        const mergedDocsMap = new Map();
        (projectMemory.documents || []).forEach(d => {
            const title = d.title || d.filename || "";
            if (title) mergedDocsMap.set(title.toLowerCase(), d);
        });
        thisConversationDocs.forEach(d => {
            const title = d.title || d.filename || "";
            if (title && !mergedDocsMap.has(title.toLowerCase())) {
                mergedDocsMap.set(title.toLowerCase(), d);
            }
        });
        if (Array.isArray(selectedDocs)) {
            selectedDocs.forEach(d => {
                const title = d.title || d.filename || "";
                if (title && !mergedDocsMap.has(title.toLowerCase())) {
                    mergedDocsMap.set(title.toLowerCase(), d);
                }
            });
        }
        const documents = Array.from(mergedDocsMap.values());
        console.log("Documents loaded:", documents.length);
        console.log("Documents passed to capsule:", documents);

        // Prepare the complete Memory object
        const memory = {
            messages: messages,
            documents: documents,
            storedFacts: combinedFacts,
            heuristic: mergedHeuristic
        };

        // Log the memory object before rendering the Inspector as requested!
        console.log("MEMORY OBJECT", memory);

        if (loadingTextSpan) {
            loadingTextSpan.textContent = "Awaiting verification in Memory Inspector...";
        }

        // Show Memory Inspector modal
        console.log("[DEBUG] Awaiting Memory Inspector verification...");
        await new Promise((resolveInspector, rejectInspector) => {
            showMemoryInspector(memory, async function(editedMemory) {
                console.log("[DEBUG] Memory Inspector onConfirm triggered.");
                if (loadingTextSpan) {
                    loadingTextSpan.textContent = "Compiling transport capsule...";
                }
                
                try {
                    const keyTitle = (title || editedMemory.project_name || 'Context').toUpperCase().replace(/[^A-Z0-9]/g, '-');
                    
                    // Compile transport capsule directly from Firestore source of truth (no LLM call)
                    const newCapsule = {
                        id          : 'CAP-' + Date.now(),
                        title       : title || editedMemory.project_name || 'Untitled Context',
                        key         : `@CAP-${keyTitle}`,
                        created_at  : new Date().toISOString(),
                        platform    : getPlatformName(),
                        project            : editedMemory.project_name,
                        project_type       : editedMemory.project_type,
                        project_purpose    : editedMemory.project_purpose,
                        final_objective    : editedMemory.final_objective,
                        major_components   : editedMemory.major_components,
                        system_design      : editedMemory.system_design,
                        technology_stack   : editedMemory.technology_stack,
                        completed          : editedMemory.completed,
                        in_progress        : editedMemory.in_progress,
                        current_step       : editedMemory.current_step,
                        next_step          : editedMemory.next_step,
                        blocked_by         : editedMemory.blocked_by,
                        hard_facts         : editedMemory.facts.map(f => f.fact),
                        user_decisions     : editedMemory.decisions,
                        stored_facts       : editedMemory.facts,
                        grouped_facts      : {
                            ...editedMemory.facts.reduce((acc, f) => {
                                if (!acc[f.type]) acc[f.type] = [];
                                acc[f.type].push(f.fact);
                                return acc;
                            }, {}),
                            user_decision: editedMemory.decisions
                        },
                        topics             : editedMemory.technology_stack || [],
                        important_concepts : editedMemory.major_components || [],
                        current_goal       : editedMemory.final_objective,
                        completed_tasks    : editedMemory.completed || [],
                        unresolved_issues  : editedMemory.blocked_by || [],
                        user_preferences   : [],
                        recent_context     : `Active step: ${editedMemory.current_step}. Next up: ${editedMemory.next_step}.`,
                        document_context   : {
                            documents_present: documents.length > 0,
                            documents: documents
                        },
                        handoff            : `Project: ${editedMemory.project_name}\nPurpose: ${editedMemory.project_purpose}\nObjective: ${editedMemory.final_objective}\nState: ${editedMemory.current_step}`,
                        conversation       : [] // Stopped using recent conversation transcript
                    };
                    
                    console.log("MEMORY OBJECT BEFORE GENERATION", newCapsule);

                    console.log("[DEBUG] Awaiting safeStorageGet for capsules...");
                    safeStorageGet(['capsules'], (result) => {
                        console.log("[DEBUG] Completed safeStorageGet for capsules.");
                        const capsules = result.capsules || [];
                        capsules.unshift(newCapsule);
                        // Log final capsule before saving
                        console.log('=== SYNAPSE DEBUG: FINAL CAPSULE (FROM FIRESTORE MEMORY) ===');
                        console.log('project:', newCapsule.project);
                        console.log('project_purpose:', newCapsule.project_purpose);
                        console.log('final_objective:', newCapsule.final_objective);
                        console.log('current_step:', newCapsule.current_step);
                        console.log('next_step:', newCapsule.next_step);
                        console.log('major_components:', newCapsule.major_components);
                        console.log('system_design:', newCapsule.system_design);
                        console.log('hard_facts count:', (newCapsule.hard_facts || []).length);
                        console.log('stored_facts count:', (newCapsule.stored_facts || []).length);
                        console.log('=== END FINAL CAPSULE ===');

                        console.log("[DEBUG] Awaiting safeStorageSet for capsules...");
                        safeStorageSet({ capsules }, () => {
                            console.log("[DEBUG] Completed safeStorageSet for capsules.");
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
                                console.log("[DEBUG] Resolving Memory Inspector promise.");
                                resolveInspector();
                            }, 1200);
                        });
                    });
                } catch (innerErr) {
                    console.error("[DEBUG] Error in Memory Inspector onConfirm:", innerErr);
                    rejectInspector(innerErr);
                }
            }, function() {
                console.log("[DEBUG] Memory Inspector onCancel triggered.");
                rejectInspector(new Error("Memory Inspector cancelled by user."));
            });
        });
        console.log("[DEBUG] Completed Memory Inspector verification.");

    } catch (err) {
        if (err.message === "Memory Inspector cancelled by user.") {
            stopLoadingAnimation(loadingInterval, 'synapse-loading-text', 'Cancelled');
            setTimeout(() => { loadingToast.style.transform = 'translateX(125%)'; }, 1000);
            if (btn) btn.classList.remove('animating');
            console.log("Synapse: Generation cancelled by user.");
        } else {
            stopLoadingAnimation(loadingInterval, 'synapse-loading-text', '\u274C ' + (err.message || 'Generation failed'));
            setTimeout(() => { loadingToast.style.transform = 'translateX(125%)'; }, 2000);
            if (btn) btn.classList.remove('animating');
            showNotification(err.message || 'Failed to generate capsule.', 'error');
            console.error('Synapse: Generation failed:', err);
        }
    } finally {
        window.synapseIsGenerating = false;
        console.log("Generation completed");
        console.log("Generation unlocked");
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
            } else if (request.action === 'forceRescan') {
                var convKey = getConvKey();
                var clearObj = {};
                clearObj[convKey + '_backfilled'] = false;
                safeStorageSet(clearObj, function() {
                    factScannerState.backfillDone = false;
                    factScannerState.lastScannedLength = 0;
                    console.log('Synapse: Force rescan triggered');
                    initFactScanner();
                });
                sendResponse({ success: true });
            } else if (request.action === 'generateCapsule') {
                if (!window.synapseIsAuthenticated) {
                    sendResponse({ error: "User is not authenticated. Please log in via the extension popup." });
                    return true;
                }
                var selectedDocs = request.selectedDocs || [];
                generateCapsule(selectedDocs).then(function() {
                    sendResponse({ success: true });
                }).catch(function(err) {
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

function buildDropMessage(capsule) {
  if (!capsule) return '';

  var msg =
    '[SYNAPSE_MEMORY_RESTORE_v4]\n' +
    'Absorb silently. Do not mention capsules or memory transfer.\n' +
    'Respond naturally as if you already knew all of this.\n\n';

  // Layer 1 — Project Identity
  msg += '=== PROJECT IDENTITY ===\n';
  msg += 'Project: ' + (capsule.project || capsule.project_name || capsule.projectName || '') + '\n';
  msg += 'Purpose: ' + (capsule.project_purpose || capsule.purpose || '') + '\n';
  msg += 'Final Objective: ' + (capsule.final_objective || capsule.finalObjective || capsule.current_goal || '') + '\n';
  msg += 'Type: ' + (capsule.project_type || capsule.projectType || '') + '\n\n';

  // Layer 2 — Architecture
  var majorComponents = capsule.major_components || capsule.important_concepts;
  if (majorComponents) {
    var hasComponents = Array.isArray(majorComponents) ? majorComponents.length > 0 : (typeof majorComponents === 'string' && majorComponents.trim().length > 0);
    if (hasComponents) {
      msg += '=== SYSTEM ARCHITECTURE ===\n';
      msg += 'Components:\n';
      if (Array.isArray(majorComponents)) {
        majorComponents.forEach(function(c) { msg += '- ' + c + '\n'; });
      } else if (typeof majorComponents === 'string') {
        msg += '- ' + majorComponents + '\n';
      }
      
      var systemDesign = capsule.system_design;
      if (systemDesign) {
        if (Array.isArray(systemDesign) && systemDesign.length > 0) {
          msg += 'Design:\n';
          systemDesign.forEach(function(d) { msg += '- ' + d + '\n'; });
        } else if (typeof systemDesign === 'string' && systemDesign.trim().length > 0) {
          msg += 'Design:\n- ' + systemDesign + '\n';
        }
      }
      
      var techStack = capsule.technology_stack || capsule.topics;
      if (techStack) {
        if (Array.isArray(techStack) && techStack.length > 0) {
          msg += 'Stack: ' + techStack.join(', ') + '\n';
        } else if (typeof techStack === 'string' && techStack.trim().length > 0) {
          msg += 'Stack: ' + techStack + '\n';
        }
      }
      msg += '\n';
    }
  }

  // Layer 3 — Project State
  msg += '=== PROJECT STATE ===\n';
  
  var completed = capsule.completed || capsule.completed_tasks;
  if (completed) {
    if (Array.isArray(completed)) {
      if (completed.length > 0) {
        msg += 'Completed:\n';
        completed.forEach(function(c) { msg += '\u2713 ' + c + '\n'; });
      }
    } else if (typeof completed === 'string' && completed.trim().length > 0) {
      msg += 'Completed:\n\u2713 ' + completed + '\n';
    }
  }

  var inProgress = capsule.in_progress;
  if (inProgress) {
    if (Array.isArray(inProgress)) {
      if (inProgress.length > 0) {
        msg += 'In Progress:\n';
        inProgress.forEach(function(i) { msg += '\u2192 ' + i + '\n'; });
      }
    } else if (typeof inProgress === 'string' && inProgress.trim().length > 0) {
      msg += 'In Progress:\n\u2192 ' + inProgress + '\n';
    }
  }

  msg += 'Current Step: ' + (capsule.current_step || '') + '\n';
  msg += 'Next Step: ' + (capsule.next_step || '') + '\n';

  var blockedBy = capsule.blocked_by || capsule.unresolved_issues;
  if (blockedBy) {
    if (Array.isArray(blockedBy)) {
      if (blockedBy.length > 0) {
        msg += 'Blocked By:\n';
        blockedBy.forEach(function(b) { msg += '\u26a0 ' + b + '\n'; });
      }
    } else if (typeof blockedBy === 'string' && blockedBy.trim().length > 0) {
      msg += 'Blocked By:\n\u26a0 ' + blockedBy + '\n';
    }
  }
  msg += '\n';

  // Layer 4 — Technical Facts
  var hasFactsSection = false;
  var factsContent = '';

  var hardFacts = capsule.hard_facts;
  if (hardFacts) {
    if (Array.isArray(hardFacts) && hardFacts.length > 0) {
      hasFactsSection = true;
      hardFacts.forEach(function(f) { factsContent += '- ' + f + '\n'; });
    } else if (typeof hardFacts === 'string' && hardFacts.trim().length > 0) {
      hasFactsSection = true;
      factsContent += '- ' + hardFacts + '\n';
    }
  }

  if (hasFactsSection) {
    msg += '=== TECHNICAL FACTS ===\n' + factsContent + '\n';
  }

  var userDecisions = capsule.user_decisions || capsule.decisions;
  if (userDecisions) {
    if (Array.isArray(userDecisions) && userDecisions.length > 0) {
      msg += '=== DECISIONS MADE ===\n';
      userDecisions.forEach(function(d) { msg += '- ' + d + '\n'; });
      msg += '\n';
    } else if (typeof userDecisions === 'string' && userDecisions.trim().length > 0) {
      msg += '=== DECISIONS MADE ===\n';
      msg += '- ' + userDecisions + '\n\n';
    }
  }

  var currentState = capsule.current_state;
  if (currentState) {
    if (Array.isArray(currentState) && currentState.length > 0) {
      msg += '=== COMPONENT STATUS ===\n';
      currentState.forEach(function(s) { msg += '- ' + s + '\n'; });
      msg += '\n';
    } else if (typeof currentState === 'string' && currentState.trim().length > 0) {
      msg += '=== COMPONENT STATUS ===\n';
      msg += '- ' + currentState + '\n\n';
    }
  }

  var codeDetails = capsule.code_details;
  if (codeDetails) {
    if (Array.isArray(codeDetails) && codeDetails.length > 0) {
      msg += '=== CODE AND CONFIG ===\n';
      codeDetails.forEach(function(c) { msg += '- ' + c + '\n'; });
      msg += '\n';
    } else if (typeof codeDetails === 'string' && codeDetails.trim().length > 0) {
      msg += '=== CODE AND CONFIG ===\n';
      msg += '- ' + codeDetails + '\n\n';
    }
  }

  // Stored facts from continuous scanner
  if (capsule.stored_facts) {
    var storedFacts = capsule.stored_facts;
    if (Array.isArray(storedFacts) && storedFacts.length > 0) {
      var byType = {};
      storedFacts.forEach(function(f) {
        if (f && typeof f === 'object') {
          var fType = f.type || 'unknown';
          var fFact = f.fact || f.value || '';
          if (fFact) {
            if (!byType[fType]) byType[fType] = [];
            byType[fType].push(fFact);
          }
        } else if (f) {
          if (!byType['unknown']) byType['unknown'] = [];
          byType['unknown'].push(String(f));
        }
      });
      
      var typeLabels = {
        hardware_configuration: 'Hardware',
        code_detail: 'Code',
        system_configuration: 'Config',
        user_decision: 'Decisions',
        system_state: 'Status',
        study_fact: 'Study',
        hardware_pin: 'Hardware Pin',
        component: 'Component',
        decision: 'Decision'
      };
      
      var hasKeys = Object.keys(byType).length > 0;
      if (hasKeys) {
        msg += '=== EXTRACTED PROJECT FACTS ===\n';
        Object.keys(byType).forEach(function(type) {
          msg += (typeLabels[type] || type) + ':\n';
          byType[type].forEach(function(f) { msg += '- ' + f + '\n'; });
        });
        msg += '\n';
      }
    } else if (typeof storedFacts === 'string' && storedFacts.trim().length > 0) {
      msg += '=== EXTRACTED PROJECT FACTS ===\n';
      msg += storedFacts + '\n\n';
    }
  }

  // Documents / PDF Knowledge Memory
  var documentsList = [];
  if (capsule.document_context && Array.isArray(capsule.document_context.documents)) {
    documentsList = capsule.document_context.documents;
  } else if (Array.isArray(capsule.documents)) {
    documentsList = capsule.documents;
  }
  
  if (documentsList.length > 0) {
    msg += '=== DOCUMENT MEMORY ===\n\n';
    documentsList.forEach(function(d) {
      if (d && typeof d === 'object') {
        var docTitle = d.filename || d.title || 'Untitled Document';
        var docSummary = d.summary || d.key_content || '';
        
        msg += 'Document:\n' + docTitle + '\n\n';
        if (docSummary) {
          msg += 'Summary:\n' + docSummary + '\n\n';
        } else {
          msg += 'Summary unavailable\n\n';
        }
      }
    });
  }

  // Recent conversation
  if (capsule.recent_context) {
    msg += '=== RECENT CONVERSATION ===\n';
    if (Array.isArray(capsule.recent_context)) {
      capsule.recent_context.forEach(function(m) {
        if (m && typeof m === 'object' && m.role && m.content) {
          msg += '[' + String(m.role).toUpperCase() + ']: ' + m.content + '\n';
        } else if (m) {
          msg += '- ' + String(m) + '\n';
        }
      });
    } else if (typeof capsule.recent_context === 'string') {
      msg += capsule.recent_context + '\n';
    } else if (typeof capsule.recent_context === 'object') {
      try {
        msg += JSON.stringify(capsule.recent_context, null, 2) + '\n';
      } catch (e) {
        console.warn("Could not serialize recent_context object", e);
      }
    } else {
      console.warn("recent_context not array or string", capsule.recent_context);
    }
    msg += '\n';
  }

  msg +=
    '[END_SYNAPSE_MEMORY]\n' +
    'You now have full project memory.\n' +
    'The Final Objective is the real goal.\n' +
    'The Current Step is just where we are right now.\n' +
    'Wait for user next message and continue naturally.';

  return msg;
}

function createSuccessOverlay() {
  var existing = document.getElementById('synapse-success-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'synapse-success-overlay';
  overlay.style.cssText = [
    'position: fixed',
    'bottom: 24px',
    'left: 50%',
    'transform: translateX(-50%)',
    'background: linear-gradient(135deg, #1a1a2e, #16213e)',
    'border: 1px solid #7c5cfc',
    'border-radius: 12px',
    'padding: 14px 24px',
    'display: flex',
    'align-items: center',
    'gap: 10px',
    'z-index: 999999',
    'box-shadow: 0 8px 32px rgba(124,92,252,0.3)',
    'animation: synapseSlideUp 0.4s ease',
    'font-family: -apple-system, BlinkMacSystemFont, sans-serif'
  ].join(';');

  overlay.innerHTML = 
    '<div style="width:8px;height:8px;background:#7c5cfc;' +
    'border-radius:50%;animation:synapsePulse 1s infinite;"></div>' +
    '<span style="color:#fff;font-size:13px;font-weight:500;">' +
    '&#10003; Synapse Context Restored</span>' +
    '<span style="color:#7c5cfc;font-size:11px;">Continue naturally</span>';

  var style = document.createElement('style');
  style.textContent = 
    '@keyframes synapseSlideUp {' +
    '  from { opacity:0; transform:translateX(-50%) translateY(20px); }' +
    '  to { opacity:1; transform:translateX(-50%) translateY(0); }' +
    '}' +
    '@keyframes synapsePulse {' +
    '  0%,100% { opacity:1; transform:scale(1); }' +
    '  50% { opacity:0.5; transform:scale(1.3); }' +
    '}';
  document.head.appendChild(style);
  document.body.appendChild(overlay);
}

function showSuccessOverlay() {
  createSuccessOverlay();
}

function hideSuccessOverlay() {
  var overlay = document.getElementById('synapse-success-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.5s';
    setTimeout(function() { overlay.remove(); }, 500);
  }
}

function sleep(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

async function dropCapsule(capsule) {
  console.log("Drop started");
  try {
    // 1. Verify Capsule is actually loaded
    if (!capsule) {
      throw new Error("Capsule loading failed: Capsule object is undefined or null");
    }
    console.log("Capsule loaded");

    // 2. Verify Capsule content is not empty
    var fullMessage = buildDropMessage(capsule);
    if (!fullMessage || !fullMessage.trim()) {
      throw new Error("Capsule content is empty: Drop message built is empty");
    }

    // 3. Verify Chat input is correctly detected
    var inputBox = findInputBox();
    if (!inputBox) {
      throw new Error("Target input box not found: Could not locate chat input textarea or textbox");
    }
    console.log("Target input found");

    // 4. Inject text into chat input
    injectValue(inputBox, fullMessage);
    
    // Verify that the text injection worked
    var currentValue = getInputValue(inputBox);
    if (!currentValue || !currentValue.includes("[SYNAPSE_MEMORY_RESTORE")) {
      // Fallback injection using direct property
      console.warn("Synapse: Verify injection failed. Attempting fallback direct properties.");
      if (inputBox.tagName === "TEXTAREA" || inputBox.tagName === "INPUT") {
        inputBox.value = fullMessage;
      } else {
        inputBox.textContent = fullMessage;
      }
      inputBox.dispatchEvent(new Event("input", { bubbles: true }));
      
      currentValue = getInputValue(inputBox);
      if (!currentValue || !currentValue.includes("[SYNAPSE_MEMORY_RESTORE")) {
        throw new Error("Text injection verification failed: Text could not be written to chat input box");
      }
    }
    console.log("Text injected");

    // 5. Detect and click submit button
    await sleep(300);
    
    const platform = getPlatformName();
    const adapter = getActiveAdapter();
    let sendBtn = adapter.getSendButton() || PlatformAdapters.fallback.getSendButton();
    
    if (sendBtn) {
      console.log("Submit button found");
      
      if (sendBtn.disabled) {
        console.log("Submit button is disabled, waiting 300ms for state to update...");
        await sleep(300);
        sendBtn = adapter.getSendButton() || PlatformAdapters.fallback.getSendButton();
      }
      
      if (sendBtn && !sendBtn.disabled) {
        const clickEvent = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window
        });
        clickEvent.__synapseInjected = true;
        sendBtn.dispatchEvent(clickEvent);
        console.log("Submit clicked");
        console.log("Drop completed");
        
        showNotification("Capsule injected and sent successfully!", "success");
        showSuccessOverlay();
        await sleep(3000);
        hideSuccessOverlay();
        return;
      }
    }

    // 6. Submit button fallback - try Enter key
    console.log("Submit button not clickable or not found, attempting Enter key press...");
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
    
    console.log("Enter key triggered");
    console.log("Drop completed");
    
    showNotification("Capsule inserted. Press Enter to send.", "success");
    showSuccessOverlay();
    await sleep(3000);
    hideSuccessOverlay();

  } catch (err) {
    console.error("Synapse: Drop Capsule failed", err);
    showNotification("Drop failed: " + err.message, "error");
  }
}


function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function processKeysInTextAsync(text, callback) {
    const patterns = [
        /@CAP-[A-Za-z0-9_-]+/gi,
        /\u25c9CAP-[A-Za-z0-9_-]+/gi,
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
                const reconstructed = buildDropMessage(capsule);
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
    const hasKeyPattern = /(@CAP-[A-Za-z0-9_-]+)|(\u25c9CAP-[A-Za-z0-9_-]+)|(\/capsule\s+[a-zA-Z0-9_-]+)/i.test(rawText);

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
        const hasKeyPattern = /(@CAP-[A-Za-z0-9_-]+)|(\u25c9CAP-[A-Za-z0-9_-]+)|(\/capsule\s+[a-zA-Z0-9_-]+)/i.test(rawText);

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
                    // Use dropCapsule for silent auto-submit with handoff wrapper
                    dropCapsule(capsule);
                } else {
                    showNotification("No matching Synapse capsule found for that key.", "error");
                }
            });
        }
    }
}
