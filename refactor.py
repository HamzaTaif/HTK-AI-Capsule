import re

with open("content.js", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Add Helper Functions
helpers = """
function isChromeContextValid() {
  try {
    return !!chrome.runtime?.id;
  } catch (e) {
    return false;
  }
}

function safeStorageGet(keys, callback) {
  try {
    if (!chrome.runtime?.id) {
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
    if (!chrome.runtime?.id) {
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
"""

code = code.replace('console.log("Synapse AI Link: In-context bridge active.");', 'console.log("Synapse AI Link: In-context bridge active.");\n' + helpers)

# 2. Replace storage calls
code = code.replace('chrome.storage.local.get', 'safeStorageGet')
code = code.replace('chrome.storage.local.set', 'safeStorageSet')

# 3. Add context checks to sendMessage
code = re.sub(r'(chrome\.runtime\.sendMessage\()', r'if (!isChromeContextValid()) { console.warn("Synapse: Extension context lost. Please refresh the page."); return; } \1', code)

# 4. Safe parse error
code = code.replace('const errorBody = await response.json().catch(() => ({}));', 'const errorBody = await safeParseError(response);')

# 5. Handle generate loading animation update
loading_old = """    // --- Setup Loading Animation Overlay ---
    let container = document.getElementById("synapse-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "synapse-toast-container";
        container.style.cssText = `position: fixed; top: 24px; right: 24px; z-index: 2147483647; display: flex; flex-direction: column; gap: 12px; font-family: 'Outfit', sans-serif;`;
        document.body.appendChild(container);
    }
    
    const loadingToast = document.createElement("div");
    loadingToast.style.cssText = `
        background: rgba(18, 18, 24, 0.92); backdrop-filter: blur(20px);
        border: 1px solid rgba(0, 163, 255, 0.35); border-left: 4px solid #00a3ff;
        color: #f3f4f6; padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 600;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); display: flex; align-items: center; gap: 10px;
        min-width: 250px; transform: translateX(120%); transition: transform 0.35s;
    `;
    const spinnerHtml = `<div style="width:16px; height:16px; border:2px solid rgba(0,163,255,0.2); border-top-color:#00a3ff; border-radius:50%; animation:synapse-spin 1s linear infinite;"></div><style>@keyframes synapse-spin { to { transform: rotate(360deg); } }</style>`;
    const loadingTextSpan = document.createElement("span");
    loadingTextSpan.innerText = "Reading your conversation...";
    loadingToast.innerHTML = spinnerHtml;
    loadingToast.appendChild(loadingTextSpan);
    container.appendChild(loadingToast);
    
    // Force layout reflow and animate in
    loadingToast.offsetHeight;
    loadingToast.style.transform = "translateX(0)";

    // Update loading text in sequence
    const loadingMessages = [
        "Reading your conversation...", // 0-2s
        "Extracting document content...", // 2-4s
        "Building your memory capsule...", // 4-7s
        "Almost done..." // 7s+
    ];
    let msgIdx = 1;
    const loadingInterval = setInterval(() => {
        if (msgIdx < loadingMessages.length) {
            loadingTextSpan.innerText = loadingMessages[msgIdx];
            msgIdx++;
        }
    }, 2500);"""

loading_new = """    // --- Setup Loading Animation Overlay ---
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
    
    // Force layout reflow and animate in
    loadingToast.style.display = "flex";
    loadingToast.offsetHeight;
    loadingToast.style.transform = "translateX(0)";

    const loadingInterval = showLoadingAnimation('synapse-loading-text');"""

if loading_old in code:
    code = code.replace(loading_old, loading_new)
else:
    print("Warning: Could not find loading_old logic")

# Handle generate end
loading_end_old = """                    clearInterval(loadingInterval);
                    loadingToast.style.transform = "translateX(125%)";
                    setTimeout(() => loadingToast.remove(), 400);
                    showNotification("Synapse context generated successfully!", "success");"""

loading_end_new = """                    stopLoadingAnimation(loadingInterval, 'synapse-loading-text', '✅ Capsule ready!');
                    setTimeout(() => {
                        loadingToast.style.transform = "translateX(125%)";
                    }, 2000);"""

if loading_end_old in code:
    code = code.replace(loading_end_old, loading_end_new)
else:
    print("Warning: Could not find loading_end_old logic")

loading_catch_old = """        clearInterval(loadingInterval);
        loadingToast.style.transform = "translateX(125%)";
        setTimeout(() => loadingToast.remove(), 400);"""

loading_catch_new = """        stopLoadingAnimation(loadingInterval, 'synapse-loading-text', '❌ Generation Failed');
        setTimeout(() => {
            loadingToast.style.transform = "translateX(125%)";
        }, 2000);"""

if loading_catch_old in code:
    code = code.replace(loading_catch_old, loading_catch_new)
else:
    print("Warning: Could not find loading_catch_old logic")

# 6. Initialization wrap
init_old = """// Check every 1000ms to handle client-side SPA routing and DOM rebuilding
setInterval(checkAndInjectButton, 1000);"""

init_new = """function initializeWithRetry(attempts = 0) {
  if (attempts > 5) {
    console.warn('Synapse: Max retries reached, giving up');
    return;
  }
  
  try {
    if (!chrome.runtime?.id) {
      setTimeout(() => initializeWithRetry(attempts + 1), 1000);
      return;
    }
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => initializeWithRetry(attempts));
      return;
    }
    
    // your actual adapter injection code goes here
    setInterval(checkAndInjectButton, 1000);
    
    document.addEventListener("click", handleGlobalClick, true);
    document.addEventListener("keydown", handleGlobalKeydown, true);
    document.addEventListener("drop", handleGlobalDrop, true);
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "togglePanel") {
            togglePopover();
            sendResponse({ success: true });
        }
    });
    
  } catch (e) {
    console.warn(`Synapse: Init attempt ${attempts} failed:`, e);
    setTimeout(() => initializeWithRetry(attempts + 1), 1000);
  }
}

// Call this instead of running init code directly
initializeWithRetry();"""

if init_old in code:
    code = code.replace(init_old, init_new)
else:
    print("Warning: Could not find init_old logic")

# Remove old event listeners from bottom since they are now in initializeWithRetry
bottom_old_1 = """document.addEventListener("click", handleGlobalClick, true);
document.addEventListener("keydown", handleGlobalKeydown, true);"""

code = code.replace(bottom_old_1, "")

# Remove drop listener and message listener
# We'll use regex to remove them to be safe
code = re.sub(r'document\.addEventListener\("drop", \(e\) => \{[\s\S]*?\}, true\);', 'function handleGlobalDrop(e) {', code)

code = code.replace('}, true);', '}') # close the function

code = re.sub(r'// 9\. POPUP MESSAGE LISTENER[\s\S]*?chrome\.runtime\.onMessage\.addListener\(\(request, sender, sendResponse\) => \{[\s\S]*?\}\);', '', code)


with open("content.js", "w", encoding="utf-8") as f:
    f.write(code)
print("Done refactoring.")
