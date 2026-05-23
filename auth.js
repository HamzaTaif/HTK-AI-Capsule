import { 
  auth, 
  provider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  db,
  doc,
  setDoc,
  getDoc,
  sendPasswordResetEmail
} from "./firebase.js";

export async function loginUser(email, password) {
  return await signInWithEmailAndPassword(auth, email, password);
}

export async function registerUser(name, email, password) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  // Create profile in Firestore
  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    name: name,
    email: email,
    provider: 'email',
    createdAt: new Date().toISOString()
  });
  
  return userCredential;
}

export async function loginWithGoogle() {
  // If chrome extension, use sendMessage fallback or direct popup
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: user.displayName || user.email.split('@')[0],
        email: user.email,
        provider: 'google',
        photoURL: user.photoURL,
        createdAt: new Date().toISOString()
      });
    }
    return result;
  } catch (err) {
    // Fallback to service worker if popup blocked
    console.warn("Direct popup login failed, trying service worker message...", err);
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "login" }, (response) => {
        if (response && response.success) {
          resolve(true);
        } else {
          reject(new Error(response ? response.error : err.message));
        }
      });
    });
  }
}

export async function logoutUser() {
  await auth.signOut();
}

export function onAuthStateChange(callback) {
  auth.onAuthStateChanged((user) => {
    // Store auth status locally for content script
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ synapse_auth_status: !!user });
    }
    callback(user);
  });
}

export function getCurrentUser() {
  return auth.currentUser;
}

export async function resetPassword(email) {
  return await sendPasswordResetEmail(auth, email);
}
