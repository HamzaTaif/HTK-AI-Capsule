/* jshint esversion: 8 */
import { 
  auth, db, collection, doc, setDoc, deleteDoc, query, where, getDocs 
} from "./firebase.js";
import { initAuthUI } from "./auth-ui.js";

// 1. Constants and config at top
const isChromeContextValid = typeof chrome !== "undefined" && !!chrome.storage;

// Safely mock chrome extension APIs if running outside extension context
if (!isChromeContextValid) {
  window.chrome = {
    storage: {
      local: {
        get: function(keys, cb) {
          const res = {};
          const stored = localStorage.getItem("capsules");
          res.capsules = stored ? JSON.parse(stored) : [];
          const vaultStored = localStorage.getItem("synapse_vault");
          res.synapse_vault = vaultStored ? JSON.parse(vaultStored) : [];
          setTimeout(function() { cb(res); }, 0);
        },
        set: function(data, cb) {
          if (data.capsules) localStorage.setItem("capsules", JSON.stringify(data.capsules));
          if (data.synapse_vault) localStorage.setItem("synapse_vault", JSON.stringify(data.synapse_vault));
          if (cb) setTimeout(cb, 0);
        }
      }
    },
    tabs: {
      query: function(opts, cb) { setTimeout(function() { cb([]); }, 0); },
      sendMessage: function(tabId, msg, cb) {
        console.log("Mock sendMessage:", msg);
        if (cb) setTimeout(function() { cb({ success: false, error: "Extension runtime only" }); }, 0);
      }
    }
  };
}

let vaultDocs = [];
let capsuleListEl = null;

// 2. Helper functions
function safeStorageGet(keys, callback) { 
  chrome.storage.local.get(keys, callback); 
}

function safeStorageSet(data, callback) { 
  chrome.storage.local.set(data, callback); 
}

function safeAttr(str) {
  return (str || "").toString().replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function compressTextLocally(raw, maxChars) {
  if (!raw || !raw.trim()) return "";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const head = cleaned.slice(0, Math.floor(maxChars * 0.6));
  const tail = cleaned.slice(-Math.floor(maxChars * 0.4));
  return head + "\n\n[...compressed...]\n\n" + tail;
}

// 3. API key management functions
// (Left intentionally blank for future Groq/Gemini key integration)

// 4. Vault render functions
function buildVaultItemHTML(docItem) {
  const isPdf = docItem.title.endsWith(".pdf");
  const isPpt = docItem.title.endsWith(".pptx") || docItem.title.endsWith(".ppt");
  const isDocx = docItem.title.endsWith(".docx") || docItem.title.endsWith(".doc");
  const icon = isPdf ? "📄" : (isPpt ? "📊" : (isDocx ? "📝" : "📎"));
  
  const shortTitle = docItem.title.slice(0, 24) + (docItem.title.length > 24 ? "..." : "");
  
  const isReady = docItem.status === "ready" || docItem.charCount > 100;
  const statusColor = isReady ? "#4caf50" : "#ff9800";
  
  let statusText = "";
  if (docItem.status === "extracting") {
    statusText = "⏳ extracting...";
  } else if (docItem.charCount > 100) {
    statusText = "✓ " + Math.round(docItem.charCount / 1000 * 10) / 10 + "k chars · " + (docItem.source === "intercepted" ? "🔵 auto-captured" : "📤 vault");
  } else {
    statusText = "⚠️ empty — try re-adding";
  }

  return '<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 2px; border-bottom:1px solid #1a1a1a;">' +
         '<div style="flex:1; overflow:hidden;">' +
         '<span style="font-size:11px; color:#ccc;">' + icon + " " + safeAttr(shortTitle) + '</span>' +
         '<div style="font-size:9px; margin-top:1px; color:' + statusColor + ';">' + statusText + '</div>' +
         '</div>' +
         '<button class="removeDocBtn" data-source="' + safeAttr(docItem.source || "vault") + '" data-title="' + safeAttr(docItem.title) + '" style="background:transparent; border:none; color:#444; cursor:pointer; font-size:13px; padding:0 4px;">✕</button>' +
         '</div>';
}

function renderVault(vault, intercepted) {
  const allDocs = [];
  vault.forEach(function(v) { allDocs.push(v); });
  intercepted.forEach(function(i) {
    if (!vault.find(function(v) { return v.title === i.title; })) {
      allDocs.push(i);
    }
  });

  const countEl = document.getElementById("vaultCount");
  if (countEl) {
    countEl.textContent = allDocs.length + " file" + (allDocs.length !== 1 ? "s" : "");
  }

  const list = document.getElementById("vaultFilesList");
  if (!list) return;

  if (allDocs.length === 0) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = allDocs.map(buildVaultItemHTML).join("");
}

function removeDoc(source, title) {
  if (source === "vault") {
    const docToDelete = vaultDocs.find(function(d) { return d.title === title; });
    vaultDocs = vaultDocs.filter(function(d) { return d.title !== title; });
    safeStorageSet({ synapse_vault: vaultDocs });
    safeStorageGet(["synapse_intercepted"], function(result) {
      renderVault(vaultDocs, result.synapse_intercepted || []);
    });
    const user = auth.currentUser;
    if (user && docToDelete && docToDelete.id) {
       deleteDoc(doc(db, "vault", docToDelete.id)).catch(function(e) { console.error("Cloud vault delete error", e); });
    }
  } else {
    safeStorageGet(["synapse_intercepted"], function(result) {
      const updated = (result.synapse_intercepted || []).filter(function(d) { return d.title !== title; });
      safeStorageSet({ synapse_intercepted: updated });
      renderVault(vaultDocs, updated);
    });
  }
}

async function extractPDFFromFile(file) {
  try {
    if (!window["pdfjs-dist/build/pdf"]) {
      await new Promise(function(resolve, reject) {
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("libs/pdf.min.js");
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    const pdfjsLib = window["pdfjs-dist/build/pdf"];
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("libs/pdf.worker.min.js");
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(function(item) { return item.str; }).join(" ") + "\n";
    }
    return fullText;
  } catch (e) {
    console.warn("Synapse Vault: PDF extraction failed:", e);
    return "[PDF text extraction failed: " + e.message + "]";
  }
}

async function extractDOCXFromFile(file) {
  try {
    if (!window.mammoth) {
      await new Promise(function(resolve, reject) {
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("libs/mammoth.min.js");
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value || "";
  } catch (e) {
    console.warn("Synapse Vault: DOCX extraction failed:", e);
    return "[DOCX text extraction failed: " + e.message + "]";
  }
}

async function processVaultFiles(fileList) {
  for (const file of fileList) {
    if (vaultDocs.find(function(d) { return d.title === file.name; })) continue;

    const entry = {
      id: "VAULT-" + Date.now() + Math.floor(Math.random()*1000),
      title: file.name,
      type: file.type,
      compressedText: "",
      charCount: 0,
      status: "extracting",
      addedAt: new Date().toISOString(),
      source: "vault",
      owner_uid: auth.currentUser ? auth.currentUser.uid : "anonymous"
    };
    vaultDocs.push(entry);
    renderVault(vaultDocs, []);

    let extractedText = "";
    try {
      if (file.name.endsWith(".pdf") || file.type === "application/pdf") {
        extractedText = await extractPDFFromFile(file);
      } else if (file.name.endsWith(".docx") || file.name.endsWith(".doc")) {
        extractedText = await extractDOCXFromFile(file);
      } else if (file.name.endsWith(".pptx") || file.name.endsWith(".ppt")) {
        const text = await file.text();
        extractedText = (text.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [])
          .map(function(t) { return t.replace(/<[^>]+>/g, "").trim(); })
          .filter(function(t) { return t.length > 2; })
          .join(" ");
      } else if (file.name.endsWith(".txt")) {
        extractedText = await file.text();
      }
    } catch (err) {
      extractedText = "[Extraction failed: " + err.message + "]";
    }

    const idx = vaultDocs.findIndex(function(d) { return d.title === file.name; });
    if (idx !== -1) {
      vaultDocs[idx].compressedText = compressTextLocally(extractedText, 3000);
      vaultDocs[idx].charCount = extractedText.length;
      vaultDocs[idx].status = extractedText.length > 50 ? "ready" : "empty";
    }

    safeStorageSet({ synapse_vault: vaultDocs });
    
    const user = auth.currentUser;
    if (user && idx !== -1) {
       const docRef = doc(db, "vault", vaultDocs[idx].id);
       setDoc(docRef, vaultDocs[idx]).catch(logVaultSaveError);
    }

    renderVault(vaultDocs, []);
  }
}

function logVaultSaveError(e) {
  console.error("Cloud vault save error:", e);
}

// 5. Document selector modal functions
function buildSelectorItemHTML(docItem, i) {
  const isPdf = docItem.title.endsWith(".pdf");
  const isPpt = docItem.title.endsWith(".pptx") || docItem.title.endsWith(".ppt");
  const isDocx = docItem.title.endsWith(".docx") || docItem.title.endsWith(".doc");
  const icon = isPdf ? "📄" : (isPpt ? "📊" : (isDocx ? "📝" : "📎"));
  
  const shortTitle = docItem.title.slice(0, 26) + (docItem.title.length > 26 ? "..." : "");
  
  const sizeText = docItem.charCount > 100 ?
    "✓ " + Math.round(docItem.charCount/1000 * 10)/10 + "k chars" :
    "⚠️ empty";

  const sourceText = docItem.source === "intercepted" ?
    "🔵 auto-captured" :
    "📤 vault";

  const statusColor = docItem.charCount > 100 ? "#4caf50" : "#ff9800";

  return '<label style="display:flex;align-items:center;gap:8px;padding:8px 6px;border-bottom:1px solid #1a1a1a;cursor:pointer;">' +
    '<input type="checkbox" id="doc_' + i + '" value="' + i + '" checked style="width:14px;height:14px;accent-color:#7c5cfc;" />' +
    '<div style="flex:1;overflow:hidden;">' +
    '<div style="font-size:11px;color:#ccc;">' + icon + " " + safeAttr(shortTitle) + '</div>' +
    '<div style="font-size:9px;color:' + statusColor + ';margin-top:1px;">' + sizeText + " · " + sourceText + '</div>' +
    '</div></label>';
}

function showDocumentSelector(docs) {
  const modal = document.createElement("div");
  modal.id = "docSelectorModal";
  modal.style.cssText = "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 9999; display: flex; flex-direction: column; padding: 16px; box-sizing: border-box;";

  const htmlParts = [];
  htmlParts.push('<div style="font-size:13px; font-weight:700; color:#fff; margin-bottom:4px;">📎 Include Documents?</div>');
  htmlParts.push('<div style="font-size:10px; color:#666; margin-bottom:12px;">Select which files to include in this capsule</div>');
  htmlParts.push('<div id="docCheckList" style="flex:1; overflow-y:auto; margin-bottom:12px;">');
  
  for (let i = 0; i < docs.length; i++) {
    htmlParts.push(buildSelectorItemHTML(docs[i], i));
  }
  
  htmlParts.push('</div>');
  htmlParts.push('<div style="display:flex; gap:8px;">');
  htmlParts.push('<button id="skipDocsBtn" style="flex:1; background:transparent; border:1px solid #333; color:#666; border-radius:6px; padding:8px; font-size:11px; cursor:pointer;">Skip — No Docs</button>');
  htmlParts.push('<button id="confirmDocsBtn" style="flex:2; background:#7c5cfc; border:none; color:#fff; border-radius:6px; padding:8px; font-size:11px; font-weight:600; cursor:pointer;">Generate Capsule ✓</button>');
  htmlParts.push('</div>');

  modal.innerHTML = htmlParts.join("");
  document.body.appendChild(modal);

  document.getElementById("skipDocsBtn").addEventListener("click", function() {
    modal.remove();
    runCapsuleGeneration([]);
  });

  document.getElementById("confirmDocsBtn").addEventListener("click", function() {
    const selectedDocs = docs.filter(function(docItem, i) {
      const checkbox = document.getElementById("doc_" + i);
      return checkbox && checkbox.checked;
    });
    modal.remove();
    runCapsuleGeneration(selectedDocs);
  });
}

// 6. Capsule generation flow
function buildCapsuleItemHTML(capsule) {
  const dateStr = new Date(capsule.created_at).toLocaleDateString([], { month: "short", day: "numeric" });
  const messageCount = capsule.conversation ? capsule.conversation.length : 0;
  const mem = capsule.structured_memory;
  const topicCount = mem && mem.main_topics ? mem.main_topics.length : 0;
  const conceptCount = mem && mem.important_concepts ? mem.important_concepts.length : 0;
  
  let memBadge = "";
  if ((topicCount + conceptCount) > 0) {
    memBadge = '<span style="font-size:9px;color:#a78bfa;margin-left:4px;" title="' + topicCount + ' topics, ' + conceptCount + ' concepts">🧠' + (topicCount + conceptCount) + '</span>';
  }
  
  const capKey = capsule.key || ("@CAP-" + capsule.title.toUpperCase().replace(/[^A-Z0-9]/g, "-"));
  
  let html = "";
  html += '<div class="capsule-item">';
  html += '<div class="capsule-info">';
  html += '<span class="capsule-name" title="' + safeAttr(capsule.title) + '">' + safeAttr(capsule.title) + '</span>';
  html += '<span class="capsule-key-badge" style="font-family: monospace; font-size: 10px; color: var(--primary); margin: 2px 0 4px 0; background: rgba(0, 255, 204, 0.08); padding: 2px 6px; border-radius: 4px; display: inline-block; width: max-content; border: 1px solid rgba(0, 255, 204, 0.15);" title="Type this key to restore memory">' + safeAttr(capKey) + '</span>';
  html += '<span class="capsule-meta">';
  html += dateStr + " • " + messageCount + " msg" + (messageCount === 1 ? "" : "s") + memBadge;
  html += '<span class="capsule-platform platform-' + safeAttr(capsule.platform || "unknown") + '">' + safeAttr(capsule.platform || "unknown") + '</span>';
  html += '</span>';
  html += '</div>';
  html += '<button class="capsule-delete deleteCapsuleBtn" title="Delete Synapse" data-id="' + safeAttr(capsule.id) + '">&times;</button>';
  html += '</div>';
  
  return html;
}

function loadCapsules() {
  chrome.storage.local.get(["capsules"], function(result) {
    const capsules = result.capsules || [];
    if (!capsuleListEl) {
      capsuleListEl = document.getElementById("capsuleList");
    }
    if (!capsuleListEl) return;
    
    if (capsules.length === 0) {
      capsuleListEl.innerHTML = '<div class="empty-state">No saved synapses yet.</div>';
      return;
    }
    
    const htmlParts = [];
    for (let i = 0; i < capsules.length; i++) {
      htmlParts.push(buildCapsuleItemHTML(capsules[i]));
    }
    capsuleListEl.innerHTML = htmlParts.join("");
  });
}

function deleteCapsule(id) {
  chrome.storage.local.get(["capsules"], function(result) {
    let capsules = result.capsules || [];
    capsules = capsules.filter(function(c) { return c.id !== id; });
    chrome.storage.local.set({ capsules: capsules }, function() {
      const user = auth.currentUser;
      if (user) {
        const docRef = doc(db, "capsules", id);
        deleteDoc(docRef).then(function() {
          console.log("Capsule deleted from cloud.");
          loadCapsules();
        }).catch(function(error) {
          console.error("Error deleting from cloud:", error);
          loadCapsules();
        });
      } else {
        loadCapsules();
      }
    });
  });
}

function uploadLocalCapsulesToCloud(user) {
  chrome.storage.local.get(["capsules"], function(result) {
    let localCapsules = result.capsules || [];
    let updated = false;
    
    localCapsules.forEach(function(capsule) {
      if (!capsule.owner_uid || capsule.owner_uid === "anonymous") {
        capsule.owner_uid = user.uid;
        updated = true;
        
        console.log("Synapse AI [Popup]: Backing up local anonymous capsule to cloud:", capsule.id);
        const docRef = doc(db, "capsules", capsule.id);
        setDoc(docRef, capsule).then(function() {
          console.log("Synapse AI [Popup]: Successfully backed up local capsule:", capsule.id);
        }).catch(function(err) {
          console.error("Synapse AI [Popup]: Error backing up capsule:", capsule.id, err);
        });
      }
    });
    
    if (updated) {
      chrome.storage.local.set({ capsules: localCapsules });
    }
  });
}

function syncWithCloud(user, callback) {
  if (!user) {
    if (callback) callback();
    return;
  }
  
  console.log("Synapse AI [Popup]: Syncing with Firestore for user:", user.uid);
  const q = query(collection(db, "capsules"), where("owner_uid", "==", user.uid));
  getDocs(q).then(function(querySnapshot) {
    chrome.storage.local.get(["capsules"], function(result) {
      let localCapsules = result.capsules || [];
      const cloudCapsules = [];
      
      const docsArray = querySnapshot.docs || [];
      for (let i = 0; i < docsArray.length; i++) {
        cloudCapsules.push(docsArray[i].data());
      }
      
      cloudCapsules.forEach(function(cloudCap) {
        const existsIdx = localCapsules.findIndex(function(c) { return c.id === cloudCap.id; });
        if (existsIdx > -1) {
          localCapsules[existsIdx] = cloudCap;
        } else {
          localCapsules.unshift(cloudCap);
        }
      });
      
      chrome.storage.local.set({ capsules: localCapsules }, function() {
        console.log("Synapse AI [Popup]: Successfully synced " + cloudCapsules.length + " cloud capsules.");
        if (callback) callback();
      });
    });
  }).catch(function(error) {
    console.error("Firestore sync error in popup:", error);
    if (callback) callback();
  });
}

function uploadLocalVaultToCloud(user) {
  chrome.storage.local.get(["synapse_vault"], function(result) {
    let localVault = result.synapse_vault || [];
    let updated = false;
    
    localVault.forEach(function(vaultDoc) {
      if (!vaultDoc.id) {
          vaultDoc.id = "VAULT-" + Date.now() + Math.floor(Math.random()*1000);
          updated = true;
      }
      if (!vaultDoc.owner_uid || vaultDoc.owner_uid === "anonymous") {
        vaultDoc.owner_uid = user.uid;
        updated = true;
        
        console.log("Synapse AI [Popup]: Backing up local vault doc to cloud:", vaultDoc.title);
        const docRef = doc(db, "vault", vaultDoc.id);
        setDoc(docRef, vaultDoc).then(function() {
          console.log("Synapse AI [Popup]: Successfully backed up vault doc:", vaultDoc.title);
        }).catch(function(err) {
          console.error("Synapse AI [Popup]: Error backing up vault doc:", vaultDoc.title, err);
        });
      }
    });
    
    if (updated) {
      chrome.storage.local.set({ synapse_vault: localVault });
    }
  });
}

function syncVaultWithCloud(user, callback) {
  if (!user) {
    if (callback) callback();
    return;
  }
  
  console.log("Synapse AI [Popup]: Syncing vault with Firestore for user:", user.uid);
  const q = query(collection(db, "vault"), where("owner_uid", "==", user.uid));
  getDocs(q).then(function(querySnapshot) {
    chrome.storage.local.get(["synapse_vault"], function(result) {
      let localVault = result.synapse_vault || [];
      const cloudDocs = [];
      
      const docsArray = querySnapshot.docs || [];
      for (let i = 0; i < docsArray.length; i++) {
        cloudDocs.push(docsArray[i].data());
      }
      
      cloudDocs.forEach(function(cloudDoc) {
        const existsIdx = localVault.findIndex(function(d) { return d.title === cloudDoc.title || d.id === cloudDoc.id; });
        if (existsIdx > -1) {
          localVault[existsIdx] = cloudDoc;
        } else {
          localVault.push(cloudDoc);
        }
      });
      
      chrome.storage.local.set({ synapse_vault: localVault }, function() {
        console.log("Synapse AI [Popup]: Successfully synced " + cloudDocs.length + " cloud vault docs.");
        if (callback) callback();
      });
    });
  }).catch(function(error) {
    console.error("Firestore vault sync error:", error);
    if (callback) callback();
  });
}

// 7. Loading animation functions
function showLoadingAnimation(btnId) {
  const el = document.getElementById(btnId) || document.getElementById("generateBtn");
  if (!el) return null;
  const originalText = el.innerText;
  el.innerText = "Generating.";
  let dots = 1;
  const interval = setInterval(function() {
    dots = (dots % 3) + 1;
    el.innerText = "Generating" + ".".repeat(dots);
  }, 400);
  return { interval: interval, el: el, originalText: originalText };
}

function stopLoadingAnimation(anim, btnId, finalMsg) {
  if (anim && anim.interval) {
    clearInterval(anim.interval);
    if (anim.el) anim.el.innerText = finalMsg;
  }
}

async function runCapsuleGeneration(selectedDocs) {
  const loadingInterval = showLoadingAnimation("generateBtn");

  try {
    const tabs = await new Promise(function(resolve) {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });
    const activeTab = tabs[0];

    const response = await new Promise(function(resolve) {
      chrome.tabs.sendMessage(activeTab.id, {
        action: "generateCapsule",
        selectedDocs: selectedDocs
      }, resolve);
    });

    if (response && response.error) throw new Error(response.error);

    let docMsg = " · no docs";
    if (selectedDocs.length > 0) {
      docMsg = " · " + selectedDocs.length + " doc(s)";
    }

    stopLoadingAnimation(loadingInterval, "generateBtn", "✅ Capsule ready" + docMsg);

    setTimeout(function() {
      if (loadingInterval && loadingInterval.el) {
        loadingInterval.el.innerText = loadingInterval.originalText;
      }
    }, 3000);

  } catch (e) {
    stopLoadingAnimation(loadingInterval, "generateBtn", "❌ " + e.message);
    setTimeout(function() {
      if (loadingInterval && loadingInterval.el) {
        loadingInterval.el.innerText = loadingInterval.originalText;
      }
    }, 3000);
  }
}

// 8. Event listeners at bottom (DOMContentLoaded wrapper)
document.addEventListener("DOMContentLoaded", function() {
  capsuleListEl = document.getElementById("capsuleList");
  const statusBadge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");
  const generateBtn = document.getElementById("generateBtn");
  const tutorialSection = document.getElementById("tutorialSection");



  // Global delegate listener for removing docs and capsules
  document.addEventListener("click", function(e) {
    if (e.target.classList.contains("removeDocBtn")) {
      const source = e.target.getAttribute("data-source");
      const title = e.target.getAttribute("data-title");
      removeDoc(source, title);
    }
    if (e.target.classList.contains("deleteCapsuleBtn")) {
      const id = e.target.getAttribute("data-id");
      deleteCapsule(id);
    }
  });

  initAuthUI(function(user) {
    uploadLocalCapsulesToCloud(user);
    uploadLocalVaultToCloud(user);
    syncWithCloud(user, function() {
      loadCapsules();
    });
    syncVaultWithCloud(user, function() {
      safeStorageGet(["synapse_vault", "synapse_intercepted"], function(result) {
        vaultDocs = result.synapse_vault || [];
        renderVault(vaultDocs, result.synapse_intercepted || []);
      });
    });
  });

  auth.onAuthStateChanged(function(user) {
    if (!user) {
      loadCapsules();
    }
  });

  safeStorageGet(["synapse_vault", "synapse_intercepted"], function(result) {
    vaultDocs = result.synapse_vault || [];
    const intercepted = result.synapse_intercepted || [];
    renderVault(vaultDocs, intercepted);
  });

  const vaultDropZone = document.getElementById("vaultDropZone");
  const vaultFileInput = document.getElementById("vaultFileInput");

  if (vaultDropZone) {
    vaultDropZone.addEventListener("click", function() {
      if (vaultFileInput) vaultFileInput.click();
    });

    vaultDropZone.addEventListener("dragover", function(e) {
      e.preventDefault();
      e.currentTarget.style.borderColor = "#7c5cfc";
      e.currentTarget.style.background = "#0d0d1a";
    });

    vaultDropZone.addEventListener("dragleave", function(e) {
      e.currentTarget.style.borderColor = "#333";
      e.currentTarget.style.background = "transparent";
    });

    vaultDropZone.addEventListener("drop", function(e) {
      e.preventDefault();
      e.currentTarget.style.borderColor = "#333";
      e.currentTarget.style.background = "transparent";
      if (e.dataTransfer && e.dataTransfer.files) {
        processVaultFiles(e.dataTransfer.files);
      }
    });
  }

  if (vaultFileInput) {
    vaultFileInput.addEventListener("change", function(e) {
      if (e.target.files) {
        processVaultFiles(e.target.files);
      }
      e.target.value = ""; 
    });
  }

  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs.length === 0) return;
    const tab = tabs[0];
    const url = tab.url || "";
    
    const isSupported = url.includes("chatgpt.com") || 
                        url.includes("openai.com") || 
                        url.includes("claude.ai") || 
                        url.includes("gemini.google.com") || 
                        url.includes("perplexity.ai");
                        
    if (isSupported) {
      if (statusBadge) statusBadge.className = "status-badge status-connected";
      if (statusText) statusText.innerText = "Connected";
      if (generateBtn) generateBtn.style.display = "flex";
      if (tutorialSection) tutorialSection.style.display = "none";
      
      if (generateBtn) {
        generateBtn.addEventListener("click", async function() {
          const vaultResult = await new Promise(function(resolve) {
            safeStorageGet(["synapse_vault", "synapse_intercepted"], resolve);
          });

          const vaultDocsArr = vaultResult.synapse_vault || [];
          
          const currentTabs = await new Promise(function(resolve) {
            chrome.tabs.query({ active: true, currentWindow: true }, resolve);
          });
          const activeTab = currentTabs[0];
          const currentUrl = activeTab ? (activeTab.url || "") : "";
          const allIntercepted = vaultResult.synapse_intercepted || {};
          
          const matchingKey = Object.keys(allIntercepted).find(function(key) {
            return currentUrl.includes(key) || key.includes(currentUrl);
          }) || currentUrl;
          
          const conversationDocs = allIntercepted[matchingKey] || [];
          const allAvailableDocs = [];
          conversationDocs.forEach(function(c) { allAvailableDocs.push(c); });
          vaultDocsArr.forEach(function(v) {
            if (!conversationDocs.find(function(c) { return c.title === v.title; })) {
              allAvailableDocs.push(v);
            }
          });

          if (allAvailableDocs.length === 0) {
            await runCapsuleGeneration([]);
            return;
          }

          showDocumentSelector(allAvailableDocs);
        });
      }
    }
  });

});
