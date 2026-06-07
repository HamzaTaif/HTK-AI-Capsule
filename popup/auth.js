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
  updateDoc,
  sendPasswordResetEmail
} from "./firebase.js";

export async function loginUser(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  // Update/create profile in Firestore
  const userDocRef = doc(db, "users", user.uid);
  const userDoc = await getDoc(userDocRef);
  const now = new Date().toISOString();
  if (userDoc.exists()) {
    await updateDoc(userDocRef, {
      lastLogin: now
    });
  } else {
    await setDoc(userDocRef, {
      name: user.displayName || email.split('@')[0],
      email: email,
      provider: 'email',
      createdAt: now,
      lastLogin: now
    });
  }
  
  return userCredential;
}

export async function registerUser(name, email, password) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  
  // Create profile in Firestore
  await setDoc(doc(db, "users", user.uid), {
    name: name,
    email: email,
    provider: 'email',
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  });
  
  return userCredential;
}

export async function loginWithGoogle() {
  // If chrome extension, use sendMessage fallback or direct popup
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
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
