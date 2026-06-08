import {
    app,
    auth,
    provider,
    signInWithPopup,
    db,
    collection,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    getDocs,
    query,
    where,
    arrayUnion,
    increment,
    serverTimestamp
} from "./popup/firebase.js";

console.log("Firebase App:", app);
console.log("Firestore DB:", db);

// Helper to wait for Firebase Auth to initialize from IndexedDB
const GROQ_API_KEY = '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';

async function summarizeAndExtractConceptsFromPDF(pdfText, filename) {
  const prompt = `You are a document summarizer.
Analyze the following extracted text from the document "${filename}".
Generate a short summary of the document contents with a maximum of 3-5 bullet points.

Return ONLY a JSON object in this exact format (no markdown, no explanations, no code fences):
{
  "summary": ["bullet point 1", "bullet point 2", "bullet point 3"]
}`;

  try {
    const response = await fetch(
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
              content: 'You are a document analysis assistant. Return raw JSON only.'
            },
            {
              role: 'user',
              content: prompt + '\n\nTEXT:\n' + pdfText.slice(0, 8000)
            }
          ],
          temperature: 0.2,
          max_tokens: 1000
        })
      }
    );

    if (!response.ok) {
      throw new Error('Groq API error: ' + response.status);
    }

    const data = await response.json();
    const rawText = data.choices[0].message.content.trim();
    const jsonText = rawText.replace(/```json/i, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonText);
    
    // Convert array of bullet points to a formatted string with newlines and bullets
    let summaryText = "";
    if (Array.isArray(parsed.summary)) {
      summaryText = parsed.summary.map(item => "* " + item).join("\n");
    } else {
      summaryText = parsed.summary || "";
    }
    
    return {
      summary: summaryText,
      concepts: [],
      facts: []
    };
  } catch (err) {
    console.error("Failed to summarize PDF via Groq:", err);
    return {
      summary: "Technical document: " + filename,
      concepts: ["Document Analysis"],
      facts: ["Document contains technical content."]
    };
  }
}

function getCurrentUserAsync() {
    return new Promise((resolve) => {
        if (auth.currentUser) {
            resolve(auth.currentUser);
            return;
        }
        const unsubscribe = auth.onAuthStateChanged((user) => {
            unsubscribe();
            resolve(user);
        });
        // Timeout fallback of 1 second
        setTimeout(() => {
            resolve(auth.currentUser);
        }, 1000);
    });
}

// Simple test write to verify Firestore connection and logs
function testFirestoreConnection() {
    console.log("Synapse AI [Service Worker]: Testing Firestore connection...");
    const testDocRef = doc(db, "test_collection", "test_connection");
    setDoc(testDocRef, {
        test: "Firestore Connected",
        timestamp: new Date().toISOString()
    })
    .then(() => {
        console.log("Synapse AI [Service Worker]: Firestore Connection SUCCESSFUL! Test document saved.");
    })
    .catch((error) => {
        console.error("Firestore failure at background.js -> testFirestoreConnection:", error);
    });
}

// Test function kept for manual debugging if needed
// Run connection test on worker startup disabled to avoid service worker restart spam

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
    }
});

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request.action === "externalAuth") {
        chrome.storage.local.set({
            synapse_auth_status: true,
            synapse_auth_user: request.user
        }, () => {
            // Also notify any listening popup contexts
            chrome.runtime.sendMessage({ action: "authChange", user: request.user });
            sendResponse({ success: true });
        });
        return true; // async
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "login") {
        signInWithPopup(auth, provider)
            .then(async (result) => {
                const user = result.user;
                try {
                    const userDocRef = doc(db, "users", user.uid);
                    const userDoc = await getDoc(userDocRef);
                    const now = new Date().toISOString();
                    if (!userDoc.exists()) {
                        await setDoc(userDocRef, {
                            name: user.displayName || user.email.split('@')[0],
                            email: user.email,
                            provider: 'google',
                            createdAt: now,
                            lastLogin: now
                        });
                    } else {
                        await updateDoc(userDocRef, {
                            lastLogin: now
                        });
                    }
                } catch (dbErr) {
                    console.error("Firestore failure at background.js -> login (profile save):", dbErr);
                }
                sendResponse({
                    success: true,
                    user: {
                        uid: user.uid,
                        name: user.displayName,
                        email: user.email,
                        photo: user.photoURL
                    }
                });
            })
            .catch((error) => {
                sendResponse({
                    success: false,
                    error: error.message
                });
            });
        return true; // async
    }

    if (request.action === "checkAuth") {
        getCurrentUserAsync().then((user) => {
            if (user) {
                sendResponse({
                    isAuthenticated: true,
                    user: {
                        uid: user.uid,
                        name: user.displayName || user.email.split('@')[0],
                        email: user.email,
                        photo: user.photoURL
                    }
                });
            } else {
                sendResponse({ isAuthenticated: false });
            }
        });
        return true; // async
    }

    if (request.action === "syncCapsules") {
        getCurrentUserAsync().then((user) => {
            if (!user) {
                sendResponse({ success: false, error: "User not authenticated" });
                return;
            }

            console.log("Synapse AI: Syncing cloud capsules for user:", user.uid);
            const q = query(collection(db, "capsules"), where("owner_uid", "==", user.uid));
            getDocs(q)
                .then((querySnapshot) => {
                    const capsules = [];
                    querySnapshot.forEach((doc) => {
                        capsules.push(doc.data());
                    });
                    console.log(`Synapse AI: Found ${capsules.length} cloud capsules.`);
                    sendResponse({ success: true, capsules });
                })
                .catch((error) => {
                    console.error("Firestore failure at background.js -> syncCapsules:", error);
                    sendResponse({ success: false, error: error.message });
                });
        });
        return true; // async
    }

    if (request.action === "saveCapsule") {
        console.log("Saving capsule...");
        getCurrentUserAsync().then(async (user) => {
            const capsule = request.capsule;
            capsule.owner_uid = user ? user.uid : "anonymous";
            const uid = capsule.owner_uid;

            console.log("Synapse AI: Saving capsule to Firestore:", capsule.id, "Owner:", uid);
            try {
                // Save main capsule in flat collection for backwards compatibility
                const docRef = doc(db, "capsules", capsule.id);
                const capsuleData = {
                    ...capsule,
                    createdAt: serverTimestamp()
                };
                await setDoc(docRef, capsuleData);

                // Save extended semantic memory separately
                if (uid !== "anonymous") {
                    const memoryRef = doc(db, 'memory', uid);
                    await setDoc(memoryRef, {
                        lastProject: capsule.project || "",
                        allTopics: arrayUnion(...(capsule.topics || [])),
                        allConcepts: arrayUnion(...(capsule.important_concepts || [])),
                        userPreferences: capsule.user_preferences || [],
                        lastGoal: capsule.current_goal || "",
                        unresolvedIssues: capsule.unresolved_issues || [],
                        lastUpdated: serverTimestamp(),
                        sessionCount: increment(1)
                    }, { merge: true });
                }

                // ── PROJECT MEMORY DATABASE SYNC ─────────────────────
                if (uid !== "anonymous") {
                    try {
                        const projectName = capsule.project || "Default Project";
                        const projectId = projectName.toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/(^-|-$)/g, '') || 'default-project';

                        const projectRef = doc(db, "users", uid, "projects", projectId);
                        
                        let projectCreatedAt = new Date().toISOString();
                        try {
                            const projectSnap = await getDoc(projectRef);
                            if (projectSnap.exists()) {
                                const data = projectSnap.data();
                                if (data.createdAt) {
                                    projectCreatedAt = data.createdAt;
                                }
                            }
                        } catch (e) {
                            console.warn("Firestore warning at background.js -> saveCapsule (check project exists):", e);
                        }

                        // Save/Update Project document
                        await setDoc(projectRef, {
                            projectName: projectName,
                            purpose: capsule.project_purpose || "",
                            finalObjective: capsule.final_objective || "",
                            projectType: capsule.project_type || "software",
                            major_components: Array.isArray(capsule.major_components) ? capsule.major_components : [],
                            system_design: Array.isArray(capsule.system_design) ? capsule.system_design : [],
                            technology_stack: Array.isArray(capsule.technology_stack) ? capsule.technology_stack : [],
                            createdAt: projectCreatedAt,
                            updatedAt: serverTimestamp()
                        }, { merge: true });

                        // 1. Capsules Subcollection
                        const capRef = doc(db, "users", uid, "projects", projectId, "capsules", capsule.id);
                        await setDoc(capRef, {
                            ...capsule,
                            createdAt: serverTimestamp()
                        });

                        // 2. Facts Subcollection
                        if (Array.isArray(capsule.stored_facts)) {
                            for (const f of capsule.stored_facts) {
                                const factValue = f.fact || f.value || f;
                                if (typeof factValue !== 'string' || !factValue.trim()) continue;

                                let importance = "medium";
                                if (f.priority === 1) importance = "high";
                                else if (f.priority === 2) importance = "medium";
                                else if (f.priority === 3) importance = "low";

                                let type = f.type || "other";
                                if (type.includes("hardware")) type = "hardware";
                                else if (type.includes("api") || type.includes("config")) type = "config";

                                const cleanFactId = factValue.toLowerCase()
                                    .replace(/[^a-z0-9]+/g, '-')
                                    .substring(0, 100);
                                
                                const factRef = doc(db, "users", uid, "projects", projectId, "facts", cleanFactId);
                                await setDoc(factRef, {
                                    type: type,
                                    value: factValue,
                                    importance: importance,
                                    createdAt: serverTimestamp()
                                }, { merge: true });
                            }
                        } else if (Array.isArray(capsule.hard_facts)) {
                            for (const f of capsule.hard_facts) {
                                const factValue = typeof f === 'object' ? (f.fact || f.value || "") : f;
                                if (!factValue.trim()) continue;

                                const cleanFactId = factValue.toLowerCase()
                                    .replace(/[^a-z0-9]+/g, '-')
                                    .substring(0, 100);

                                const factRef = doc(db, "users", uid, "projects", projectId, "facts", cleanFactId);
                                await setDoc(factRef, {
                                    type: f.type || "general",
                                    value: factValue,
                                    importance: f.importance || "medium",
                                    createdAt: serverTimestamp()
                                }, { merge: true });
                            }
                        }

                        // 3. Decisions Subcollection
                        if (Array.isArray(capsule.user_decisions)) {
                            for (const d of capsule.user_decisions) {
                                const decValue = typeof d === 'object' ? (d.decision || d.value || "") : d;
                                if (!decValue.trim()) continue;

                                const cleanDecId = decValue.toLowerCase()
                                    .replace(/[^a-z0-9]+/g, '-')
                                    .substring(0, 100);

                                const decRef = doc(db, "users", uid, "projects", projectId, "decisions", cleanDecId);
                                await setDoc(decRef, {
                                    value: decValue,
                                    createdAt: serverTimestamp()
                                }, { merge: true });
                            }
                        }

                        // 4. State Subcollection
                        const stateRef = doc(db, "users", uid, "projects", projectId, "state", "current");
                        await setDoc(stateRef, {
                            currentStep: capsule.current_step || "",
                            nextStep: capsule.next_step || "",
                            completed: Array.isArray(capsule.completed) ? capsule.completed : [],
                            inProgress: Array.isArray(capsule.in_progress) ? capsule.in_progress : [],
                            blockedBy: Array.isArray(capsule.blocked_by) ? capsule.blocked_by : [],
                            updatedAt: serverTimestamp()
                        }, { merge: true });

                        // 5. Documents & Images Subcollections
                        try {
                            const storageResult = await new Promise(resolve => {
                                chrome.storage.local.get(["synapse_vault", "synapse_intercepted"], resolve);
                            });
                            
                            const localVault = storageResult.synapse_vault || [];
                            const localInterceptedObj = storageResult.synapse_intercepted || {};
                            
                            let flatIntercepted = [];
                            Object.keys(localInterceptedObj).forEach(key => {
                                const docs = localInterceptedObj[key];
                                if (Array.isArray(docs)) {
                                    flatIntercepted.push(...docs);
                                }
                            });

                            const allLocalDocs = [...localVault, ...flatIntercepted];

                            if (capsule.document_context && Array.isArray(capsule.document_context.documents)) {
                                for (const d of capsule.document_context.documents) {
                                    const matched = allLocalDocs.find(ld => ld.title === d.title);
                                    
                                    const docTitle = d.title || "unnamed";
                                    const docType = d.type || (matched ? matched.type : "unknown");
                                    const docText = matched ? (matched.compressedText || "") : (d.key_content || "");
                                    const charCount = matched ? (matched.charCount || docText.length) : docText.length;
                                    const addedAt = matched ? (matched.addedAt || matched.capturedAt) : new Date().toISOString();
                                    const source = matched ? (matched.source || "intercepted") : "unknown";
                                    const isImage = (d.isImage || 
                                                     (matched && matched.isImage) || 
                                                     (docType && docType.startsWith("image/")) || 
                                                     /\.(png|jpe?g|gif|webp|bmp)$/i.test(docTitle));

                                    const cleanDocId = docTitle
                                        .toLowerCase()
                                        .replace(/[^a-z0-9]+/g, '-')
                                        .substring(0, 100);

                                    if (isImage) {
                                        const imgRef = doc(db, "users", uid, "projects", projectId, "images", cleanDocId);
                                        await setDoc(imgRef, {
                                            title: docTitle,
                                            type: docType,
                                            description: docText,
                                            capturedAt: addedAt || new Date().toISOString()
                                        }, { merge: true });
                                    } else {
                                        const docRef = doc(db, "users", uid, "projects", projectId, "documents", cleanDocId);
                                        await setDoc(docRef, {
                                            title: docTitle,
                                            type: docType,
                                            compressedText: docText,
                                            charCount: charCount,
                                            addedAt: addedAt || new Date().toISOString(),
                                            source: source
                                        }, { merge: true });
                                    }
                                }
                            }
                        } catch (docSyncErr) {
                            console.warn("Firestore warning at background.js -> saveCapsule (Documents/Images sync):", docSyncErr);
                        }

                        console.log("Synapse AI: Project Memory Database successfully synchronized for project:", projectId);
                    } catch (projErr) {
                        console.error("Firestore failure at background.js -> saveCapsule (project sync):", projErr);
                    }
                }

                console.log("Capsule saved:", capsule.id);
                console.log("Synapse AI: Capsule successfully stored in Firestore:", capsule.id);
                sendResponse({ success: true });
            } catch (error) {
                console.error("Firestore failure at background.js -> saveCapsule:", error);
                sendResponse({ success: false, error: error.message });
            }
        });
        return true; // async
    }

    if (request.action === "resolveCapsule") {
        const key = request.key;
        console.log("Synapse AI: Resolving cloud capsule for key:", key);
        const q = query(collection(db, "capsules"), where("key", "==", key));
        getDocs(q)
            .then((querySnapshot) => {
                if (!querySnapshot.empty) {
                    const docSnap = querySnapshot.docs[0];
                    console.log("Synapse AI: Cloud capsule resolved successfully.");
                    sendResponse({ success: true, capsule: docSnap.data() });
                } else {
                    console.warn("Synapse AI: Capsule key not found in cloud:", key);
                    sendResponse({ success: false, error: "Capsule not found in cloud." });
                }
            })
            .catch((error) => {
                console.error("Firestore failure at background.js -> resolveCapsule:", error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // async
    }

    if (request.action === "processPDF") {
        getCurrentUserAsync().then(async (user) => {
            const filename = request.filename;
            const text = request.text || "";
            const projectName = request.projectName || "Default Project";
            const docId = filename.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'unnamed-pdf';

            console.log("Synapse AI: Processing and Summarizing PDF:", filename);
            try {
                // Generate summary, concepts, and facts via Groq
                const summaryData = await summarizeAndExtractConceptsFromPDF(text, filename);
                
                const projectId = projectName.toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '') || 'default-project';
                
                const pageCount = request.pageCount || Math.max(1, Math.ceil(text.length / 3000));

                const finalDoc = {
                    filename: filename,
                    title: filename, // legacy compatibility
                    summary: summaryData.summary || "",
                    concepts: Array.isArray(summaryData.concepts) ? summaryData.concepts : [],
                    facts: Array.isArray(summaryData.facts) ? summaryData.facts : [],
                    pageCount: pageCount,
                    projectId: projectId,
                    charCount: text.length, // legacy compatibility
                    source: "pdf_upload", // legacy compatibility
                    uploadedAt: serverTimestamp(),
                    compressedText: text.slice(0, 4000) // legacy compatibility
                };

                // Save to flat documents collection (documents/{documentId})
                const flatDocRef = doc(db, "documents", docId);
                await setDoc(flatDocRef, finalDoc);

                // Also save to the user's project subcollection if authenticated
                if (user) {
                    const uid = user.uid;
                    const projectDocRef = doc(db, "users", uid, "projects", projectId, "documents", docId);
                    await setDoc(projectDocRef, finalDoc, { merge: true });
                    console.log("Synapse AI: Saved PDF to project subcollection:", projectId + "/documents/" + docId);
                }

                console.log("Synapse AI: PDF memory saved for", filename);
                sendResponse({ success: true, doc: finalDoc });
            } catch (error) {
                console.error("Firestore failure at background.js -> processPDF:", error);
                sendResponse({ success: false, error: error.message });
            }
        });
        return true; // async
    }

    if (request.action === "loadProjectMemory") {
        getCurrentUserAsync().then(async (user) => {
            if (!user) {
                sendResponse({ success: false, error: "User not authenticated" });
                return;
            }
            const uid = user.uid;
            let projectName = request.projectName;
            
            try {
                // If projectName is not specified, resolve from memory/uid lastProject
                if (!projectName) {
                    const memoryRef = doc(db, "memory", uid);
                    const memorySnap = await getDoc(memoryRef);
                    if (memorySnap.exists()) {
                        projectName = memorySnap.data().lastProject;
                    }
                }
                
                if (!projectName) {
                    projectName = "Default Project";
                }
                
                const projectId = projectName.toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '') || 'default-project';
                
                const projectRef = doc(db, "users", uid, "projects", projectId);
                const projectSnap = await getDoc(projectRef);
                
                let projectDoc = {
                    projectName: projectName,
                    purpose: "",
                    finalObjective: "",
                    projectType: "",
                    major_components: [],
                    system_design: [],
                    technology_stack: []
                };
                
                if (projectSnap.exists()) {
                    projectDoc = { ...projectDoc, ...projectSnap.data() };
                }
                
                // Load subcollection: facts
                const factsColl = collection(db, "users", uid, "projects", projectId, "facts");
                const factsSnap = await getDocs(factsColl);
                const factsList = [];
                factsSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    factsList.push({
                        fact: data.value || "",
                        type: data.type || "other",
                        priority: data.importance === "high" ? 1 : (data.importance === "low" ? 3 : 2)
                    });
                });
                
                // Load subcollection: decisions
                const decisionsColl = collection(db, "users", uid, "projects", projectId, "decisions");
                const decisionsSnap = await getDocs(decisionsColl);
                const decisionsList = [];
                decisionsSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    decisionsList.push(data.value || "");
                });
                
                // Load subcollection: state/current
                const stateRef = doc(db, "users", uid, "projects", projectId, "state", "current");
                const stateSnap = await getDoc(stateRef);
                let stateDoc = {
                    currentStep: "",
                    nextStep: "",
                    completed: [],
                    inProgress: [],
                    blockedBy: []
                };
                if (stateSnap.exists()) {
                    const data = stateSnap.data();
                    stateDoc = {
                        currentStep: data.currentStep || "",
                        nextStep: data.nextStep || "",
                        completed: data.completed || [],
                        inProgress: data.inProgress || [],
                        blockedBy: data.blockedBy || []
                    };
                }
                
                // Load subcollection: documents
                const docsColl = collection(db, "users", uid, "projects", projectId, "documents");
                const docsSnap = await getDocs(docsColl);
                const docsList = [];
                docsSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    docsList.push({
                        title: data.title || "",
                        filename: data.filename || data.title || "",
                        type: data.type || "",
                        compressedText: data.compressedText || "",
                        charCount: data.charCount || 0,
                        addedAt: data.addedAt || "",
                        source: data.source || "unknown",
                        concepts: data.concepts || [],
                        facts: data.facts || [],
                        summary: data.summary || "",
                        pageCount: data.pageCount || 1,
                        projectId: data.projectId || projectId
                    });
                });

                sendResponse({
                    success: true,
                    projectName: projectName,
                    projectId: projectId,
                    project: projectDoc,
                    facts: factsList,
                    decisions: decisionsList,
                    state: stateDoc,
                    documents: docsList
                });
            } catch (error) {
                console.error("Firestore failure at background.js -> loadProjectMemory:", error);
                sendResponse({ success: false, error: error.message });
            }
        });
        return true; // async
    }

    if (request.action === "getDashboardData") {
        getCurrentUserAsync().then(async (user) => {
            if (!user) {
                sendResponse({ success: false, error: "User not authenticated" });
                return;
            }
            const uid = user.uid;
            
            try {
                // Get all projects
                const projectsColl = collection(db, "users", uid, "projects");
                const projectsSnap = await getDocs(projectsColl);
                
                const projectsList = [];
                let totalFacts = 0;
                let totalDocs = 0;
                let totalCaps = 0;
                
                for (const projDoc of projectsSnap.docs) {
                    const data = projDoc.data();
                    const projectId = projDoc.id;
                    const projectName = data.projectName || projectId;
                    
                    // Fetch counts/subcollections for each project
                    const factsSnap = await getDocs(collection(db, "users", uid, "projects", projectId, "facts"));
                    const docsSnap = await getDocs(collection(db, "users", uid, "projects", projectId, "documents"));
                    const capsSnap = await getDocs(collection(db, "users", uid, "projects", projectId, "capsules"));
                    
                    const projectFacts = [];
                    factsSnap.forEach(docSnap => {
                        const d = docSnap.data();
                        projectFacts.push({
                            fact: d.value || "",
                            type: d.type || "other",
                            priority: d.importance === "high" ? 1 : (d.importance === "low" ? 3 : 2)
                        });
                    });

                    const projectDecisions = [];
                    const decisionsSnap = await getDocs(collection(db, "users", uid, "projects", projectId, "decisions"));
                    decisionsSnap.forEach(docSnap => {
                        projectDecisions.push(docSnap.data().value || "");
                    });

                    const projectState = {
                        currentStep: "",
                        nextStep: "",
                        completed: [],
                        inProgress: [],
                        blockedBy: []
                    };
                    const stateRef = doc(db, "users", uid, "projects", projectId, "state", "current");
                    const stateSnap = await getDoc(stateRef);
                    if (stateSnap.exists()) {
                        const d = stateSnap.data();
                        projectState.currentStep = d.currentStep || "";
                        projectState.nextStep = d.nextStep || "";
                        projectState.completed = d.completed || [];
                        projectState.inProgress = d.inProgress || [];
                        projectState.blockedBy = d.blockedBy || [];
                    }

                    const projectDocs = [];
                    docsSnap.forEach(docSnap => {
                        const d = docSnap.data();
                        projectDocs.push({
                            title: d.filename || d.title || "",
                            filename: d.filename || d.title || "",
                            summary: d.summary || "",
                            concepts: d.concepts || [],
                            charCount: d.charCount || 0,
                            source: d.source || "unknown",
                            compressedText: d.compressedText || d.key_content || ""
                        });
                    });
                    
                    totalFacts += factsSnap.size;
                    totalDocs += docsSnap.size;
                    totalCaps += capsSnap.size;
                    
                    projectsList.push({
                        id: projectId,
                        projectName: projectName,
                        purpose: data.purpose || "",
                        finalObjective: data.finalObjective || "",
                        projectType: data.projectType || "software",
                        major_components: data.major_components || [],
                        system_design: data.system_design || [],
                        technology_stack: data.technology_stack || [],
                        facts: projectFacts,
                        decisions: projectDecisions,
                        state: projectState,
                        documents: projectDocs,
                        updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : new Date().toISOString()
                    });
                }
                
                // Sort projects by updatedAt desc
                projectsList.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                
                sendResponse({
                    success: true,
                    stats: {
                        projects: projectsList.length,
                        documents: totalDocs,
                        facts: totalFacts,
                        capsules: totalCaps
                    },
                    projects: projectsList
                });
            } catch (error) {
                console.error("Firestore failure at background.js -> getDashboardData:", error);
                sendResponse({ success: false, error: error.message });
            }
        });
        return true; // async
    }

    // ── BACKGROUND MEMORY EXTRACTION ─────────────────────────────────────────
    // Called by the incremental scanner when new messages appear.
    // Runs Groq extraction + saves to Firestore WITHOUT blocking the UI.
    if (request.action === "analyzeConversation") {
        getCurrentUserAsync().then(async (user) => {
            if (!user) {
                sendResponse({ success: false, error: "User not authenticated" });
                return;
            }
            const uid = user.uid;
            const transcript = request.transcript || "";
            const projectName = request.projectName || "Default Project";
            const existingFacts = request.existingFacts || [];

            const projectId = projectName.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '') || 'default-project';

            // Respond immediately so content.js is not blocked
            sendResponse({ success: true, status: "processing" });

            try {
                console.log("Synapse BG: Starting background Groq extraction for:", projectName);

                // ── Build Groq prompt ──────────────────────────────────────
                const existingFactsStr = existingFacts.length > 0
                    ? "ALREADY KNOWN FACTS (do not duplicate):\n" +
                      existingFacts.map(f => "- [" + f.type + "] " + f.fact).join("\n") + "\n\n"
                    : "";

                const prompt =
                    "You are a technical project memory extraction engine.\n" +
                    "Analyze this conversation and extract structured memory. Return raw JSON only.\n\n" +
                    existingFactsStr +
                    "CONVERSATION (latest messages):\n" + transcript.slice(0, 6000) + "\n\n" +
                    "Extract and return ONLY new or updated information:\n" +
                    "{\n" +
                    "  \"project_name\": \"full descriptive project name (e.g. Automatic Water Tank Controller)\",\n" +
                    "  \"project_type\": \"hardware|software|study|research|other\",\n" +
                    "  \"purpose\": \"one sentence: what does this project do when complete?\",\n" +
                    "  \"final_objective\": \"one sentence: what is the end goal?\",\n" +
                    "  \"major_components\": [\"every component, IC, module, library, service\"],\n" +
                    "  \"technology_stack\": [\"languages, frameworks, hardware platforms\"],\n" +
                    "  \"system_design\": [\"how components connect and interact\"],\n" +
                    "  \"current_step\": \"single specific action happening right now\",\n" +
                    "  \"next_step\": \"what comes immediately after\",\n" +
                    "  \"completed\": [\"things fully finished and working\"],\n" +
                    "  \"in_progress\": [\"things being worked on right now\"],\n" +
                    "  \"blocked_by\": [\"anything preventing progress\"],\n" +
                    "  \"new_facts\": [\n" +
                    "    { \"type\": \"hardware_pin|component|component_value|code_detail|system_configuration|system_state|study_fact|other\", \"value\": \"specific fact\", \"importance\": \"high|medium|low\" }\n" +
                    "  ],\n" +
                    "  \"new_decisions\": [\"specific decisions made in this conversation\"]\n" +
                    "}\n\n" +
                    "CRITICAL RULES:\n" +
                    "- project_name must be the FULL project name, never a step or action\n" +
                    "- BAD project_name: 'LOW probe connected' or 'Pin 5 6'\n" +
                    "- GOOD project_name: 'Automatic Water Tank Controller'\n" +
                    "- new_facts must be SPECIFIC: 'CD4011 NAND gate used for probe logic', not 'Pin 5'\n" +
                    "- Extract component names, IC numbers, resistor values, decisions\n" +
                    "- Only include GENUINELY new facts not already in ALREADY KNOWN FACTS\n" +
                    "- Return empty arrays [] if nothing new in that field";

                const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + GROQ_API_KEY
                    },
                    body: JSON.stringify({
                        model: "llama-3.1-8b-instant",
                        messages: [
                            { role: "system", content: "You are a memory extraction engine. Return raw JSON only. No markdown." },
                            { role: "user", content: prompt }
                        ],
                        temperature: 0,
                        max_tokens: 2000
                    })
                });

                if (!response.ok) {
                    console.warn("Synapse BG: Groq API error:", response.status, "— skipping extraction");
                    return;
                }

                const data = await response.json();
                const rawText = (data.choices[0].message.content || "").trim()
                    .replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();

                let extracted;
                try {
                    extracted = JSON.parse(rawText);
                } catch (e) {
                    console.warn("Synapse BG: JSON parse failed for Groq extraction:", e.message);
                    return;
                }

                console.log("Synapse BG: Groq extraction complete. Saving to Firestore...");

                // ── Save project identity ──────────────────────────────────
                const resolvedProjectName = (extracted.project_name && extracted.project_name !== "Default Project")
                    ? extracted.project_name : projectName;
                const resolvedProjectId = resolvedProjectName.toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '') || 'default-project';

                const projectRef = doc(db, "users", uid, "projects", resolvedProjectId);
                const projectUpdate = { updatedAt: serverTimestamp() };
                if (extracted.project_name)     projectUpdate.projectName     = extracted.project_name;
                if (extracted.project_type)     projectUpdate.projectType     = extracted.project_type;
                if (extracted.purpose)          projectUpdate.purpose         = extracted.purpose;
                if (extracted.final_objective)  projectUpdate.finalObjective  = extracted.final_objective;
                if (Array.isArray(extracted.major_components) && extracted.major_components.length > 0)
                    projectUpdate.major_components = extracted.major_components;
                if (Array.isArray(extracted.technology_stack) && extracted.technology_stack.length > 0)
                    projectUpdate.technology_stack = extracted.technology_stack;
                if (Array.isArray(extracted.system_design) && extracted.system_design.length > 0)
                    projectUpdate.system_design = extracted.system_design;

                await setDoc(projectRef, projectUpdate, { merge: true });

                // ── Save state ─────────────────────────────────────────────
                const stateUpdate = {};
                if (extracted.current_step)                stateUpdate.currentStep = extracted.current_step;
                if (extracted.next_step)                   stateUpdate.nextStep    = extracted.next_step;
                if (Array.isArray(extracted.completed) && extracted.completed.length > 0)
                    stateUpdate.completed   = extracted.completed;
                if (Array.isArray(extracted.in_progress) && extracted.in_progress.length > 0)
                    stateUpdate.inProgress  = extracted.in_progress;
                if (Array.isArray(extracted.blocked_by) && extracted.blocked_by.length > 0)
                    stateUpdate.blockedBy   = extracted.blocked_by;

                if (Object.keys(stateUpdate).length > 0) {
                    const stateRef = doc(db, "users", uid, "projects", resolvedProjectId, "state", "current");
                    await setDoc(stateRef, stateUpdate, { merge: true });
                }

                // ── Save new facts ─────────────────────────────────────────
                const newFacts = Array.isArray(extracted.new_facts) ? extracted.new_facts : [];
                for (const fact of newFacts) {
                    const val = (fact.value || "").trim();
                    if (!val || val.length < 4) continue;
                    const factId = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 100);
                    const factRef = doc(db, "users", uid, "projects", resolvedProjectId, "facts", factId);
                    await setDoc(factRef, {
                        value: val,
                        type: fact.type || "other",
                        importance: fact.importance || "medium",
                        createdAt: serverTimestamp()
                    }, { merge: true });
                }

                // ── Save new decisions ─────────────────────────────────────
                const newDecisions = Array.isArray(extracted.new_decisions) ? extracted.new_decisions : [];
                for (const decision of newDecisions) {
                    const val = (typeof decision === "string" ? decision : decision.value || "").trim();
                    if (!val || val.length < 4) continue;
                    const decId = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 100);
                    const decRef = doc(db, "users", uid, "projects", resolvedProjectId, "decisions", decId);
                    await setDoc(decRef, {
                        value: val,
                        createdAt: serverTimestamp()
                    }, { merge: true });
                }

                console.log(
                    "Synapse BG: Background extraction complete →",
                    newFacts.length, "facts,",
                    newDecisions.length, "decisions saved to Firestore for project:", resolvedProjectName
                );
            } catch (bgErr) {
                console.error("Firestore failure at background.js -> analyzeConversation:", bgErr);
            }
        });
        return true; // async
    }

    return false;
});
