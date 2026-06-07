import {
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

// Helper to wait for Firebase Auth to initialize from IndexedDB
const GROQ_API_KEY = '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';

async function summarizeAndExtractConceptsFromPDF(pdfText, filename) {
  const prompt = `You are a technical document analyzer.
Analyze the following extracted text from the document "${filename}".
1. Write a concise, 1-2 sentence summary of what the document is about.
2. Extract the 4-6 most important key concepts/topics taught or discussed in the document as a bulleted list.

Return ONLY a JSON object in this exact format (no markdown, no explanations, no code fences):
{
  "summary": "the concise summary here",
  "concepts": ["concept1", "concept2", "concept3", "concept4"]
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
          max_tokens: 800
        })
      }
    );

    if (!response.ok) {
      throw new Error('Groq API error: ' + response.status);
    }

    const data = await response.json();
    const rawText = data.choices[0].message.content.trim();
    const jsonText = rawText.replace(/```json/i, '').replace(/```/g, '').trim();
    return JSON.parse(jsonText);
  } catch (err) {
    console.error("Failed to summarize/extract concepts from PDF via Groq:", err);
    return {
      summary: "Technical document: " + filename,
      concepts: ["Document Analysis", "General Concept"]
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
        console.error("Synapse AI [Service Worker]: Firestore Connection FAILED!", error);
    });
}

// Test function kept for manual debugging if needed
// Run connection test on worker startup disabled to avoid service worker restart spam

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
                    console.error("Firestore user profile save error in background worker:", dbErr);
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
                    console.error("Firestore sync error:", error);
                    sendResponse({ success: false, error: error.message });
                });
        });
        return true; // async
    }

    if (request.action === "saveCapsule") {
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
                            console.warn("Failed to check if project exists, default createdAt will be used", e);
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
                            console.warn("Synapse AI: Documents/Images sync error:", docSyncErr);
                        }

                        console.log("Synapse AI: Project Memory Database successfully synchronized for project:", projectId);
                    } catch (projErr) {
                        console.error("Synapse AI: Project Memory Database sync error:", projErr);
                    }
                }

                console.log("Synapse AI: Capsule successfully stored in Firestore:", capsule.id);
                sendResponse({ success: true });
            } catch (error) {
                console.error("Synapse AI: Firestore setDoc error saving capsule:", error);
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
                console.error("Firestore query error resolving key:", error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // async
    }

    if (request.action === "processPDF") {
        getCurrentUserAsync().then(async (user) => {
            const filename = request.filename;
            const text = request.text || "";
            const docId = filename.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'unnamed-pdf';

            console.log("Synapse AI: Processing and Summarizing PDF:", filename);
            try {
                // Generate summary and concepts via Groq
                const summaryData = await summarizeAndExtractConceptsFromPDF(text, filename);
                
                const docRef = doc(db, "documents", docId);
                const finalDoc = {
                    filename: filename,
                    summary: summaryData.summary || "",
                    concepts: Array.isArray(summaryData.concepts) ? summaryData.concepts : [],
                    uploadedAt: serverTimestamp()
                };
                
                await setDoc(docRef, finalDoc);
                console.log("Synapse AI: Saved PDF summary to documents/" + docId);
                
                sendResponse({ success: true, doc: finalDoc });
            } catch (error) {
                console.error("Synapse AI: Error processing PDF:", error);
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
                        type: data.type || "",
                        compressedText: data.compressedText || "",
                        charCount: data.charCount || 0,
                        addedAt: data.addedAt || "",
                        source: data.source || "unknown",
                        concepts: data.concepts || [],
                        summary: data.summary || ""
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
                console.error("Synapse AI: Error loading project memory:", error);
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
                            summary: d.summary || "",
                            concepts: d.concepts || []
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
                console.error("Synapse AI: Error loading dashboard data:", error);
                sendResponse({ success: false, error: error.message });
            }
        });
        return true; // async
    }

    return false;
});