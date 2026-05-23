import {
    auth,
    provider,
    signInWithPopup,
    db,
    collection,
    doc,
    setDoc,
    getDocs,
    query,
    where
} from "./firebase.js";

// Helper to wait for Firebase Auth to initialize from IndexedDB
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
            .then((result) => {
                const user = result.user;
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
        getCurrentUserAsync().then((user) => {
            const capsule = request.capsule;
            capsule.owner_uid = user ? user.uid : "anonymous";

            console.log("Synapse AI: Saving capsule to Firestore:", capsule.id, "Owner:", capsule.owner_uid);
            const docRef = doc(db, "capsules", capsule.id);
            setDoc(docRef, capsule)
                .then(() => {
                    console.log("Synapse AI: Capsule successfully stored in Firestore:", capsule.id);
                    sendResponse({ success: true });
                })
                .catch((error) => {
                    console.error("Synapse AI: Firestore setDoc error saving capsule:", error);
                    sendResponse({ success: false, error: error.message });
                });
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

    return false;
});