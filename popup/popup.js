/* jshint esversion: 8 */
import { 
  auth, db, collection, doc, setDoc, deleteDoc, query, where, getDocs, serverTimestamp 
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
    statusText = "⚠️ empty - try re-adding";
  }

  return '<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 2px; border-bottom:1px solid #1a1a1a;">' +
         '<div style="flex:1; overflow:hidden;">' +
         '<span style="font-size:11px; color:#ccc;">' + icon + " " + safeAttr(shortTitle) + '</span>' +
         '<div style="font-size:9px; margin-top:1px; color:' + statusColor + ';">' + statusText + '</div>' +
         '</div>' +
         '<button class="removeDocBtn" data-source="' + safeAttr(docItem.source || "vault") + '" data-title="' + safeAttr(docItem.title) + '" style="background:transparent; border:none; color:#444; cursor:pointer; font-size:13px; padding:0 4px;">×</button>' +
         '</div>';
}

function renderVault(vault, intercepted) {
  const user = auth.currentUser;
  if (!user) {
    const countEl = document.getElementById("vaultCount");
    if (countEl) countEl.textContent = "0 files";
    const list = document.getElementById("vaultFilesList");
    if (list) list.innerHTML = "";
    return;
  }

  const allDocs = [];
  vault.forEach(function(v) {
    if (v.owner_uid === user.uid) {
      allDocs.push(v);
    }
  });

  let flatIntercepted = [];
  if (Array.isArray(intercepted)) {
    flatIntercepted = intercepted;
  } else if (intercepted && typeof intercepted === 'object') {
    Object.keys(intercepted).forEach(function(key) {
      const docs = intercepted[key];
      if (Array.isArray(docs)) {
        docs.forEach(function(d) {
          flatIntercepted.push(d);
        });
      }
    });
  }

  flatIntercepted.forEach(function(i) {
    if (!allDocs.find(function(v) { return v.title === i.title; })) {
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
      renderVault(vaultDocs, result.synapse_intercepted || {});
    });
    const user = auth.currentUser;
    if (user && docToDelete && docToDelete.id) {
        deleteDoc(doc(db, "vault", docToDelete.id)).catch(function(e) { console.error("Firestore failure at popup.js -> removeDoc (cloud vault delete):", e); });
    }
  } else {
    safeStorageGet(["synapse_intercepted"], function(result) {
      const intercepted = result.synapse_intercepted || {};
      if (Array.isArray(intercepted)) {
        const updated = intercepted.filter(function(d) { return d.title !== title; });
        safeStorageSet({ synapse_intercepted: updated }, function() {
          renderVault(vaultDocs, updated);
        });
      } else {
        Object.keys(intercepted).forEach(function(url) {
          if (Array.isArray(intercepted[url])) {
            intercepted[url] = intercepted[url].filter(function(d) { return d.title !== title; });
          }
        });
        safeStorageSet({ synapse_intercepted: intercepted }, function() {
          renderVault(vaultDocs, intercepted);
        });
      }
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
    return { text: fullText, pageCount: pdf.numPages };
  } catch (e) {
    console.warn("Synapse Vault: PDF extraction failed:", e);
    return { text: "[PDF text extraction failed: " + e.message + "]", pageCount: 0 };
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
    let summary = "";
    let concepts = [];
    let facts = [];
    let pageCount = 1;
    try {
      if (file.name.endsWith(".pdf") || file.type === "application/pdf") {
        try {
          const pdfData = await promiseWithTimeout((async () => {
            const pdfResult = await extractPDFFromFile(file);
            const raw = typeof pdfResult === "object" ? pdfResult.text : pdfResult;
            const pCount = typeof pdfResult === "object" ? pdfResult.pageCount : 1;
            let sum = "";
            let concs = [];
            let fts = [];
            try {
              const response = await promiseWithTimeout(new Promise(resolve => {
                chrome.runtime.sendMessage({
                  action: 'processPDF',
                  filename: file.name,
                  text: raw,
                  pageCount: pCount,
                  projectName: selectedProject ? selectedProject.projectName : "Default Project"
                }, resolve);
              }), 12000, new Error("Background process timeout"));
              if (response && response.success && response.doc) {
                sum = response.doc.summary;
                concs = response.doc.concepts;
                fts = response.doc.facts || [];
              }
            } catch (bgErr) {
              console.warn("Failed or timed out to process PDF in background:", bgErr);
            }
            return { raw: raw, summary: sum, concepts: concs, facts: fts, pageCount: pCount };
          })(), 15000, new Error("PDF processing timeout"));
          
          extractedText = pdfData.raw;
          summary = pdfData.summary;
          concepts = pdfData.concepts;
          facts = pdfData.facts;
          pageCount = pdfData.pageCount;
        } catch (timeoutErr) {
          console.warn("PDF processing timed out or failed:", timeoutErr);
          extractedText = "[PDF processing unavailable: " + timeoutErr.message + "]";
          alert("PDF could not be processed.");
        }
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
      if (summary) vaultDocs[idx].summary = summary;
      if (concepts && concepts.length > 0) vaultDocs[idx].concepts = concepts;
      if (facts && facts.length > 0) vaultDocs[idx].facts = facts;
      vaultDocs[idx].pageCount = pageCount;
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
  console.error("Firestore failure at popup.js -> processVaultFiles (cloud vault save):", e);
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
  htmlParts.push('<button id="skipDocsBtn" style="flex:1; background:transparent; border:1px solid #333; color:#666; border-radius:6px; padding:8px; font-size:11px; cursor:pointer;">Skip - No Docs</button>');
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
  const user = auth.currentUser;
  if (!user) {
    if (!capsuleListEl) {
      capsuleListEl = document.getElementById("capsuleList");
    }
    if (capsuleListEl) {
      capsuleListEl.innerHTML = '<div class="empty-state">Please log in to view synapses.</div>';
    }
    return;
  }

  chrome.storage.local.get(["capsules"], function(result) {
    const allCapsules = result.capsules || [];
    const capsules = allCapsules.filter(function(c) {
      return c.owner_uid === user.uid;
    });

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
          console.error("Firestore failure at popup.js -> deleteCapsule:", error);
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
          console.error("Firestore failure at popup.js -> uploadLocalCapsulesToCloud:", err);
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
    console.error("Firestore failure at popup.js -> syncWithCloud:", error);
    if (error.code === 'unavailable' || error.message.includes("offline") || error.message.includes("unavailable") || error.message.includes("Could not reach Cloud Firestore")) {
      updateOfflineStatus(true, "Could not reach database");
    }
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
          console.error("Firestore failure at popup.js -> uploadLocalVaultToCloud:", err);
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
    console.error("Firestore failure at popup.js -> syncVaultWithCloud:", error);
    if (error.code === 'unavailable' || error.message.includes("offline") || error.message.includes("unavailable") || error.message.includes("Could not reach Cloud Firestore")) {
      updateOfflineStatus(true, "Could not reach database");
    }
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

function updateOfflineStatus(isOffline, reason) {
  const banner = document.getElementById("offlineBanner");
  if (!banner) return;
  if (isOffline) {
    banner.style.display = "flex";
    if (reason) {
      banner.querySelector("span:last-child").innerText = "Firestore is offline (" + reason + "). Memory sync & capsule generation are suspended.";
    } else {
      banner.querySelector("span:last-child").innerText = "Firestore is offline. Memory sync & capsule generation are suspended.";
    }
  } else {
    banner.style.display = "none";
  }
}

// 8. Event listeners at bottom (DOMContentLoaded wrapper)
document.addEventListener("DOMContentLoaded", function() {
  capsuleListEl = document.getElementById("capsuleList");
  const statusBadge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");
  const generateBtn = document.getElementById("generateBtn");
  const tutorialSection = document.getElementById("tutorialSection");

  window.addEventListener("online", function() {
    updateOfflineStatus(false);
  });
  window.addEventListener("offline", function() {
    updateOfflineStatus(true, "Browser is offline");
  });
  
  if (!navigator.onLine) {
    updateOfflineStatus(true, "Browser is offline");
  }



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
    loadDashboard();
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

      // Rescan button - triggers full historical backfill on active tab
      const rescanBtn = document.getElementById("rescanBtn");
      if (rescanBtn) {
        rescanBtn.style.display = "block";
        rescanBtn.addEventListener("click", function() {
          chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: "forceRescan" }, function(response) {
              if (chrome.runtime.lastError) {
                rescanBtn.textContent = "X Could not reach page";
              } else {
                rescanBtn.textContent = "✓ Rescan triggered - check console";
                rescanBtn.style.color = "#00ffcc";
                rescanBtn.style.borderColor = "#00ffcc";
              }
              setTimeout(function() {
                rescanBtn.textContent = "🔄 Rescan Current Conversation";
                rescanBtn.style.color = "#666";
                rescanBtn.style.borderColor = "#333";
              }, 3000);
            });
          });
        });
      }
    }
  });

  // ── DASHBOARD SYSTEM ──
  const MOCK_PROJECTS = {
    "water-tank-controller": {
      projectName: "Water Tank Controller",
      projectType: "hardware",
      purpose: "Automate water levels in residential tanks.",
      finalObjective: "Maintain optimal level without user intervention.",
      major_components: ["NodeMCU", "Ultrasonic Sensor", "Relay", "Water Pump"],
      system_design: ["Relay control switch", "Sensor polling loop"],
      technology_stack: ["C++", "Arduino IDE"],
      facts: [
        { fact: "Pump connected to Relay Pin D1", type: "hardware", priority: 1 },
        { fact: "Ultrasonic Echo Pin to D2", type: "hardware", priority: 1 },
        { fact: "Ultrasonic Trigger Pin to D3", type: "hardware", priority: 1 },
        { fact: "Low Threshold set to 20%", type: "threshold", priority: 2 },
        { fact: "High Threshold set to 95%", type: "threshold", priority: 2 }
      ],
      state: {
        currentStep: "Calibrating sensor depth",
        nextStep: "Testing auto-cutoff logic",
        completed: ["Circuit assembly", "Basic NodeMCU Wi-Fi config"],
        inProgress: ["Calibrating sensor"],
        blockedBy: []
      },
      decisions: [
        "Switch from analog float switch to ultrasonic sensor for higher reliability."
      ],
      documents: [
        { title: "Water_Sensor_Spec.pdf", summary: "Technical specs for the ultrasonic sensor.", concepts: ["Ultrasonic Wave Velocity", "Air Gap Correction", "Calibration Offset"] }
      ]
    },
    "oop-exam-prep": {
      projectName: "OOP Exam Prep",
      projectType: "study",
      purpose: "Prepare for midterm examination.",
      finalObjective: "Master inheritance, polymorphism, and memory management in C++.",
      major_components: ["C++ Compiler", "Textbook Exercises"],
      system_design: ["Study schedule", "Code practice exercises"],
      technology_stack: ["C++", "G++ Compiler"],
      facts: [
        { fact: "Abstract classes require at least one pure virtual function", type: "study", priority: 1 },
        { fact: "Virtual destructors prevent memory leaks during deletion of derived objects", type: "study", priority: 1 },
        { fact: "Copy constructor must take reference parameter to avoid infinite recursion", type: "study", priority: 1 }
      ],
      state: {
        currentStep: "Reviewing dynamic memory allocation in constructors",
        nextStep: "Mock exam practice",
        completed: ["Read Chapter 4 on Polymorphism"],
        inProgress: ["Dynamic memory review"],
        blockedBy: []
      },
      decisions: [
        "Focus study on virtual tables and pointer lookup overhead."
      ],
      documents: [
        { title: "Week_5.pdf", summary: "Slides covering classes and objects.", concepts: ["Encapsulation", "Constructor", "Objects", "Classes"] }
      ]
    },
    "hospital-priority-system": {
      projectName: "Hospital Priority System",
      projectType: "software",
      purpose: "Develop triage routing software for emergency rooms.",
      finalObjective: "Decrease average patient wait times for critical issues.",
      major_components: ["React Frontend", "Express Backend", "MongoDB"],
      system_design: ["Triage sorting queue", "Real-time updates websocket"],
      technology_stack: ["JavaScript", "React", "Node.js", "MongoDB"],
      facts: [
        { fact: "Patients sorted dynamically using a min-heap based on severity score", type: "software", priority: 1 },
        { fact: "Triage level 1 corresponds to immediate resuscitation", type: "software", priority: 1 },
        { fact: "Severity score recalculated every 5 minutes for waiting list", type: "software", priority: 1 }
      ],
      state: {
        currentStep: "Integrating priority queue API endpoints",
        nextStep: "Performance testing triage reassessment interval",
        completed: ["Mock patient schema", "Basic routing layout"],
        inProgress: ["Integrating heap algorithm"],
        blockedBy: []
      },
      decisions: [
        "Use min-heap over standard array sorting for O(log N) insertion performance."
      ],
      documents: [
        { title: "Triage_Protocol.pdf", summary: "Standard triage protocol guidelines.", concepts: ["Priority Scoring", "Resource Allocation", "Min-Heap Sort", "Re-evaluation Frequency"] }
      ]
    }
  };

  let selectedProject = null;
  let allCombinedProjects = [];

  function loadDashboard() {
    if (!isChromeContextValid()) return;
    
    chrome.runtime.sendMessage({ action: "getDashboardData" }, function(response) {
      if (response && response.success) {
        // Merge with MOCK_PROJECTS
        const dbProjects = response.projects || [];
        const mergedList = [...dbProjects];
        
        // Find missing mock projects
        Object.keys(MOCK_PROJECTS).forEach(key => {
          const mock = MOCK_PROJECTS[key];
          const exists = dbProjects.some(p => p.projectName.toLowerCase() === mock.projectName.toLowerCase());
          if (!exists) {
            mergedList.push({
              id: key,
              projectName: mock.projectName,
              purpose: mock.purpose,
              finalObjective: mock.finalObjective,
              projectType: mock.projectType,
              major_components: mock.major_components,
              system_design: mock.system_design,
              technology_stack: mock.technology_stack,
              facts: mock.facts,
              state: mock.state,
              decisions: mock.decisions,
              documents: mock.documents,
              updatedAt: new Date().toISOString(),
              isMock: true
            });
          }
        });
        
        allCombinedProjects = mergedList;
        
        // Update stats
        let totalDocs = response.stats.documents;
        let totalFacts = response.stats.facts;
        
        allCombinedProjects.forEach(p => {
          if (p.isMock) {
            totalDocs += (p.documents || []).length;
            totalFacts += (p.facts || []).length;
          }
        });
        
        const projectsEl = document.getElementById("dash-stat-projects");
        const docsEl = document.getElementById("dash-stat-documents");
        const factsEl = document.getElementById("dash-stat-facts");
        const capsEl = document.getElementById("dash-stat-capsules");
        
        if (projectsEl) projectsEl.innerText = allCombinedProjects.length;
        if (docsEl) docsEl.innerText = totalDocs;
        if (factsEl) factsEl.innerText = totalFacts;
        
        const count = response.stats.capsules;
        console.log("Dashboard loaded capsules:", count);
        if (capsEl) capsEl.innerText = count;
        
        renderRecentProjectsList(allCombinedProjects);
      } else {
        console.warn("Failed to load dashboard data:", response ? response.error : "Unknown error");
        const errMsg = response ? (response.error || "") : "";
        if (errMsg.includes("offline") || errMsg.includes("unavailable") || errMsg.includes("Could not reach Cloud Firestore") || !navigator.onLine) {
          updateOfflineStatus(true, "Could not reach database");
        }
      }
    });
  }
  window.loadDashboard = loadDashboard; // Expose globally just in case

  function renderRecentProjectsList(projects) {
    const listEl = document.getElementById("recentProjectsList");
    if (!listEl) return;
    
    if (projects.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No projects found.</div>';
      return;
    }
    
    listEl.innerHTML = projects.map(p => {
      const formattedDate = new Date(p.updatedAt).toLocaleDateString();
      return `
        <div class="project-list-item" data-id="${p.id}" style="
          background: var(--card-bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 10px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <div style="max-width: 85%;">
            <div style="font-size: 11px; font-weight: 600; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${p.projectName}</div>
            <div style="font-size: 9px; color: var(--text-muted); margin-top: 2px;">
              ${p.projectType.toUpperCase()} • ${formattedDate}
            </div>
          </div>
          <div style="font-size: 10px; color: var(--primary);">➔</div>
        </div>
      `;
    }).join("");
    
    listEl.querySelectorAll(".project-list-item").forEach(item => {
      item.addEventListener("click", function() {
        listEl.querySelectorAll(".project-list-item").forEach(i => {
          i.style.borderColor = "var(--border)";
          i.style.background = "var(--card-bg)";
        });
        item.style.borderColor = "var(--primary)";
        item.style.background = "rgba(0, 255, 204, 0.04)";
        
        const projectId = item.getAttribute("data-id");
        selectedProject = allCombinedProjects.find(p => p.id === projectId);
        
        const container = document.getElementById("projectActionContainer");
        const activeName = document.getElementById("activeProjectName");
        
        if (selectedProject && container && activeName) {
          activeName.innerText = selectedProject.projectName;
          container.style.display = "block";
        }
      });
    });
  }

  // Dashboard Button Handlers
  const closeProjectActions = document.getElementById("closeProjectActions");
  if (closeProjectActions) {
    closeProjectActions.addEventListener("click", function() {
      const container = document.getElementById("projectActionContainer");
      if (container) container.style.display = "none";
      const listEl = document.getElementById("recentProjectsList");
      if (listEl) {
        listEl.querySelectorAll(".project-list-item").forEach(i => {
          i.style.borderColor = "var(--border)";
          i.style.background = "var(--card-bg)";
        });
      }
      selectedProject = null;
    });
  }

  const btnViewMemory = document.getElementById("btnViewMemory");
  if (btnViewMemory) {
    btnViewMemory.addEventListener("click", function() {
      if (!selectedProject) return;
      const modal = document.getElementById("dashboardDetailsModal");
      const title = document.getElementById("modalDetailTitle");
      const content = document.getElementById("modalDetailContent");
      if (!modal || !title || !content) return;
      
      title.innerText = "Project Memory: " + selectedProject.projectName;
      
      // Keep working copies
      let facts = (selectedProject.facts || []).map(f => ({
        fact: f.fact || f.value || (typeof f === 'string' ? f : ""),
        type: f.type || "other",
        priority: f.priority || 2
      }));
      let decisions = [...(selectedProject.decisions || selectedProject.user_decisions || [])].map(d => typeof d === 'object' ? (d.decision || d.value || "") : d);
      
      function renderEditor() {
        let stateHtml = "No active state recorded.";
        if (selectedProject.state) {
          const state = selectedProject.state;
          stateHtml = `
            <div style="display:flex; flex-direction:column; gap:4px;">
              <div><span style="color:var(--primary); font-weight:600;">Current:</span> ${state.currentStep || "None"}</div>
              <div><span style="color:var(--secondary); font-weight:600;">Next:</span> ${state.nextStep || "None"}</div>
              <div><span style="color:var(--text-muted); font-weight:600;">Completed:</span> ${Array.isArray(state.completed) ? state.completed.join(", ") : "None"}</div>
            </div>
          `;
        }
        
        content.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:12px; padding-bottom: 20px;">
            <div>
              <div style="font-size:9px; color:var(--primary); font-weight:700; text-transform:uppercase; margin-bottom:2px;">Purpose</div>
              <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:6px; border-radius:6px;">${selectedProject.purpose || "No purpose specified."}</div>
            </div>
            <div>
              <div style="font-size:9px; color:var(--primary); font-weight:700; text-transform:uppercase; margin-bottom:2px;">Final Objective</div>
              <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:6px; border-radius:6px;">${selectedProject.finalObjective || "No final objective specified."}</div>
            </div>
            <div>
              <div style="font-size:9px; color:var(--primary); font-weight:700; text-transform:uppercase; margin-bottom:2px;">Architecture Stack</div>
              <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:6px; border-radius:6px; display:flex; flex-direction:column; gap:3px;">
                <div><b>Components:</b> ${Array.isArray(selectedProject.major_components) ? selectedProject.major_components.join(", ") : "None"}</div>
                <div><b>System Design:</b> ${Array.isArray(selectedProject.system_design) ? selectedProject.system_design.join(", ") : "None"}</div>
                <div><b>Tech Stack:</b> ${Array.isArray(selectedProject.technology_stack) ? selectedProject.technology_stack.join(", ") : "None"}</div>
              </div>
            </div>
            <div>
              <div style="font-size:9px; color:var(--primary); font-weight:700; text-transform:uppercase; margin-bottom:2px;">State Tracker</div>
              <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:6px; border-radius:6px;">${stateHtml}</div>
            </div>
            
            <!-- Facts Section -->
            <div>
              <div style="font-size:9px; color:var(--primary); font-weight:700; text-transform:uppercase; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                <span>Granular Facts (${facts.length})</span>
                <button id="btn-dash-add-fact" style="background:var(--primary); border:none; color:#121218; font-size:9px; font-weight:700; padding:2px 6px; border-radius:3px; cursor:pointer;">+ Add Fact</button>
              </div>
              <div id="dash-facts-list" style="display:flex; flex-direction:column; gap:6px;">
                ${facts.map((f, idx) => `
                  <div style="display:flex; gap:4px; align-items:center; background:rgba(255,255,255,0.01); border:1px solid var(--border); padding:4px; border-radius:4px;">
                    <input type="text" class="dash-fact-type-input" data-index="${idx}" value="${f.type}" style="width:75px; font-size:10px; background:rgba(0,0,0,0.3); border:1px solid var(--border); color:#fff; padding:2px; border-radius:3px;" placeholder="Type">
                    <input type="text" class="dash-fact-val-input" data-index="${idx}" value="${f.fact.replace(/"/g, '&quot;')}" style="flex:1; font-size:10px; background:rgba(0,0,0,0.3); border:1px solid var(--border); color:#fff; padding:2px; border-radius:3px;" placeholder="Fact value">
                    <select class="dash-fact-priority-input" data-index="${idx}" style="font-size:10px; background:rgba(0,0,0,0.3); border:1px solid var(--border); color:#fff; padding:2px; border-radius:3px; width:45px;">
                      <option value="1" ${f.priority === 1 ? 'selected' : ''}>P1</option>
                      <option value="2" ${f.priority === 2 ? 'selected' : ''}>P2</option>
                      <option value="3" ${f.priority === 3 ? 'selected' : ''}>P3</option>
                    </select>
                    <button class="btn-dash-del-fact" data-index="${idx}" style="background:none; border:none; color:var(--error); cursor:pointer; font-size:11px; padding: 2px 4px;">×</button>
                  </div>
                `).join("") || '<div style="font-size:10px; color:var(--text-muted); padding:4px;">No facts recorded.</div>'}
              </div>
            </div>
            
            <!-- Decisions Section -->
            <div>
              <div style="font-size:9px; color:var(--primary); font-weight:700; text-transform:uppercase; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                <span>Decisions (${decisions.length})</span>
                <button id="btn-dash-add-decision" style="background:var(--primary); border:none; color:#121218; font-size:9px; font-weight:700; padding:2px 6px; border-radius:3px; cursor:pointer;">+ Add Decision</button>
              </div>
              <div id="dash-decisions-list" style="display:flex; flex-direction:column; gap:6px;">
                ${decisions.map((d, idx) => `
                  <div style="display:flex; gap:4px; align-items:center; background:rgba(255,255,255,0.01); border:1px solid var(--border); padding:4px; border-radius:4px;">
                    <input type="text" class="dash-decision-val-input" data-index="${idx}" value="${d.replace(/"/g, '&quot;')}" style="flex:1; font-size:10px; background:rgba(0,0,0,0.3); border:1px solid var(--border); color:#fff; padding:2px; border-radius:3px;" placeholder="Decision value">
                    <button class="btn-dash-del-decision" data-index="${idx}" style="background:none; border:none; color:var(--error); cursor:pointer; font-size:11px; padding: 2px 4px;">×</button>
                  </div>
                `).join("") || '<div style="font-size:10px; color:var(--text-muted); padding:4px;">No decisions recorded.</div>'}
              </div>
            </div>
            
            <button id="btnSaveDashboardMemory" class="btn" style="margin-top:12px; padding:6px; font-size:11px;">Save Changes</button>
          </div>
        `;
        
        // Add events
        content.querySelector("#btn-dash-add-fact").addEventListener("click", function() {
          facts.push({ fact: "", type: "hardware_pin", priority: 2 });
          renderEditor();
        });
        
        content.querySelector("#btn-dash-add-decision").addEventListener("click", function() {
          decisions.push("");
          renderEditor();
        });
        
        content.querySelectorAll(".dash-fact-type-input").forEach(el => {
          el.addEventListener("change", function(e) {
            const idx = parseInt(el.getAttribute("data-index"));
            facts[idx].type = e.target.value.trim();
          });
        });
        
        content.querySelectorAll(".dash-fact-val-input").forEach(el => {
          el.addEventListener("change", function(e) {
            const idx = parseInt(el.getAttribute("data-index"));
            facts[idx].fact = e.target.value.trim();
          });
        });
        
        content.querySelectorAll(".dash-fact-priority-input").forEach(el => {
          el.addEventListener("change", function(e) {
            const idx = parseInt(el.getAttribute("data-index"));
            facts[idx].priority = parseInt(e.target.value);
          });
        });
        
        content.querySelectorAll(".btn-dash-del-fact").forEach(el => {
          el.addEventListener("click", function() {
            const idx = parseInt(el.getAttribute("data-index"));
            facts.splice(idx, 1);
            renderEditor();
          });
        });
        
        content.querySelectorAll(".dash-decision-val-input").forEach(el => {
          el.addEventListener("change", function(e) {
            const idx = parseInt(el.getAttribute("data-index"));
            decisions[idx] = e.target.value.trim();
          });
        });
        
        content.querySelectorAll(".btn-dash-del-decision").forEach(el => {
          el.addEventListener("click", function() {
            const idx = parseInt(el.getAttribute("data-index"));
            decisions.splice(idx, 1);
            renderEditor();
          });
        });
        
        content.querySelector("#btnSaveDashboardMemory").addEventListener("click", async function() {
          const btn = content.querySelector("#btnSaveDashboardMemory");
          btn.disabled = true;
          btn.innerText = "Saving...";
          
          try {
            const user = auth.currentUser;
            if (!user) throw new Error("User not authenticated");
            const uid = user.uid;
            const projectId = selectedProject.id;
            
            // Save main project document in Firestore to ensure it's not a broken ref (and to convert mock -> real if needed)
            await setDoc(doc(db, "users", uid, "projects", projectId), {
              projectName: selectedProject.projectName,
              purpose: selectedProject.purpose || "",
              finalObjective: selectedProject.finalObjective || "",
              projectType: selectedProject.projectType || "software",
              major_components: selectedProject.major_components || [],
              system_design: selectedProject.system_design || [],
              technology_stack: selectedProject.technology_stack || [],
              updatedAt: serverTimestamp()
            }, { merge: true });
            
            // 1. Facts
            // Get original facts list for tracking deletions
            const originalFacts = selectedProject.facts || [];
            const originalFactIds = originalFacts.map(f => {
              const val = (f.fact || f.value || (typeof f === 'string' ? f : "")).trim();
              return val.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 100);
            });
            
            const newFacts = facts.filter(f => f.fact.trim());
            const newFactIds = newFacts.map(f => {
              return f.fact.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 100);
            });
            
            // Delete removed facts
            for (const oldId of originalFactIds) {
              if (!newFactIds.includes(oldId) && oldId) {
                await deleteDoc(doc(db, "users", uid, "projects", projectId, "facts", oldId));
              }
            }
            
            // Write/Update facts
            for (const f of newFacts) {
              const factVal = f.fact.trim();
              const cleanId = factVal.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 100);
              let importance = "medium";
              if (f.priority === 1) importance = "high";
              else if (f.priority === 3) importance = "low";
              
              await setDoc(doc(db, "users", uid, "projects", projectId, "facts", cleanId), {
                type: f.type || "other",
                value: factVal,
                importance: importance,
                createdAt: serverTimestamp()
              }, { merge: true });
            }
            
            // 2. Decisions
            const originalDecisions = selectedProject.decisions || selectedProject.user_decisions || [];
            const originalDecIds = originalDecisions.map(d => {
              const val = typeof d === 'object' ? (d.decision || d.value || "") : d;
              return val.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 100);
            });
            
            const newDecisions = decisions.filter(d => d.trim());
            const newDecIds = newDecisions.map(d => {
              return d.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 100);
            });
            
            // Delete removed decisions
            for (const oldId of originalDecIds) {
              if (!newDecIds.includes(oldId) && oldId) {
                await deleteDoc(doc(db, "users", uid, "projects", projectId, "decisions", oldId));
              }
            }
            
            // Write/Update decisions
            for (const d of newDecisions) {
              const decVal = d.trim();
              const cleanId = decVal.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 100);
              await setDoc(doc(db, "users", uid, "projects", projectId, "decisions", cleanId), {
                value: decVal,
                createdAt: serverTimestamp()
              }, { merge: true });
            }
            
            // Update local copy
            selectedProject.facts = newFacts;
            selectedProject.decisions = newDecisions;
            if (selectedProject.isMock) {
              delete selectedProject.isMock;
            }
            
            // Reload dashboard to update counts and list
            loadDashboard();
            
            alert("✅ Project memory successfully saved to Firestore!");
            modal.style.display = "none";
          } catch (err) {
            console.error("Firestore failure at popup.js -> btnSaveDashboardMemory:", err);
            if (err.code === 'unavailable' || err.message.includes("offline") || err.message.includes("unavailable") || err.message.includes("Could not reach Cloud Firestore")) {
              updateOfflineStatus(true, "Could not reach database");
            }
            alert("❌ Failed to save memory: " + err.message);
          } finally {
            btn.disabled = false;
            btn.innerText = "Save Changes";
          }
        });
      }
      
      renderEditor();
      modal.style.display = "flex";
    });
  }

  const btnViewDocuments = document.getElementById("btnViewDocuments");
  if (btnViewDocuments) {
    btnViewDocuments.addEventListener("click", function() {
      if (!selectedProject) return;
      const modal = document.getElementById("dashboardDetailsModal");
      const title = document.getElementById("modalDetailTitle");
      const content = document.getElementById("modalDetailContent");
      if (!modal || !title || !content) return;
      
      title.innerText = "📄 Document Memory: " + selectedProject.projectName;
      
      let docsHtml = '<div style="font-size:11px; color:var(--text-muted); text-align:center; padding:20px;">📁 No documents attached to this project.</div>';
      if (Array.isArray(selectedProject.documents) && selectedProject.documents.length > 0) {
        docsHtml = selectedProject.documents.map(d => {
          const concepts = d.concepts || [];
          const facts = d.facts || [];
          const name = d.title || d.filename || 'Untitled';
          const summary = d.summary || '';
          const charCount = d.charCount ? Math.round(d.charCount / 1000 * 10) / 10 + 'k chars' : '';
          const isPdf = name.toLowerCase().endsWith('.pdf');
          const icon = isPdf ? '📄' : '📎';
          return `
            <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:10px; padding:10px 12px; margin-bottom:10px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                <div style="font-weight:700; font-size:11px; color:#fff;">${icon} ${name}</div>
                ${charCount ? `<span style="font-size:9px; color:var(--primary); background:rgba(0,255,204,0.08); padding:1px 6px; border-radius:10px;">${charCount}</span>` : ''}
              </div>
              <div style="font-size:10px; color:#9ca3af; margin-bottom:4px;">Type: ${escapeHtml(d.type || d.filetype || 'unknown')}</div>
              <div style="font-size:10px; color:var(--text-muted); margin-bottom:8px; line-height:1.5; white-space:pre-wrap;">${summary || "Summary unavailable"}</div>
            </div>
          `;
        }).join("");
      }
      
      content.innerHTML = `
        <div style="padding-bottom: 20px;">
          ${docsHtml}
        </div>
      `;
      modal.style.display = "flex";
    });
  }

  const btnGenerateCapsule = document.getElementById("btnGenerateCapsule");
  if (btnGenerateCapsule) {
    btnGenerateCapsule.addEventListener("click", function() {
      if (!selectedProject) return;
      
      btnGenerateCapsule.disabled = true;
      btnGenerateCapsule.innerText = "Generating...";
      
      const keyTitle = selectedProject.projectName.toUpperCase().replace(/[^A-Z0-9]/g, '-');
      const capsule = {
        id: 'CAP-' + Date.now(),
        title: selectedProject.projectName + " Context",
        key: `@CAP-${keyTitle}`,
        created_at: new Date().toISOString(),
        platform: "Extension Dashboard",
        project: selectedProject.projectName,
        project_type: selectedProject.projectType || "software",
        project_purpose: selectedProject.purpose || "",
        final_objective: selectedProject.finalObjective || "",
        major_components: selectedProject.major_components || [],
        system_design: selectedProject.system_design || [],
        technology_stack: selectedProject.technology_stack || [],
        completed: selectedProject.state ? (selectedProject.state.completed || []) : [],
        in_progress: selectedProject.state ? (selectedProject.state.inProgress || []) : [],
        current_step: selectedProject.state ? (selectedProject.state.currentStep || "") : "",
        next_step: selectedProject.state ? (selectedProject.state.nextStep || "") : "",
        blocked_by: selectedProject.state ? (selectedProject.state.blockedBy || []) : [],
        hard_facts: Array.isArray(selectedProject.facts) ? selectedProject.facts.map(f => f.fact || f.value || f) : [],
        stored_facts: Array.isArray(selectedProject.facts) ? selectedProject.facts : [],
        user_decisions: selectedProject.decisions || selectedProject.user_decisions || [],
        document_context: {
          documents_present: Array.isArray(selectedProject.documents) && selectedProject.documents.length > 0,
          documents: (selectedProject.documents || []).map(d => ({
            title: d.title || d.filename || 'Untitled',
            filename: d.filename || d.title || '',
            summary: d.summary || '',
            concepts: d.concepts || [],
            charCount: d.charCount || 0,
            key_content: d.compressedText || d.key_content || ''
          }))
        }
      };
      
      chrome.runtime.sendMessage({ action: "saveCapsule", capsule: capsule }, function(res) {
        btnGenerateCapsule.disabled = false;
        btnGenerateCapsule.innerText = "Generate Capsule";
        
        if (res && res.success) {
          navigator.clipboard.writeText(JSON.stringify(capsule, null, 2)).then(() => {
            alert(`✅ Capsule successfully generated for ${selectedProject.projectName}!\n\nTransport JSON copied to clipboard.`);
          }).catch(() => {
            alert(`✅ Capsule successfully generated for ${selectedProject.projectName}!`);
          });
          loadDashboard();
        } else {
          alert("❌ Failed to save capsule: " + (res ? res.error : "Unknown error"));
        }
      });
    });
  }

  const closeDetailModal = document.getElementById("closeDetailModal");
  if (closeDetailModal) {
    closeDetailModal.addEventListener("click", function() {
      const modal = document.getElementById("dashboardDetailsModal");
      if (modal) modal.style.display = "none";
    });
  }

});

