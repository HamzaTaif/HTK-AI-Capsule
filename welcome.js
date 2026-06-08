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
  updateProfile
} from "./popup/firebase.js";

// DOM Elements
const tabSignIn = document.getElementById("tabSignIn");
const tabSignUp = document.getElementById("tabSignUp");
const nameGroup = document.getElementById("nameGroup");
const authName = document.getElementById("authName");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const btnSubmit = document.getElementById("btnSubmit");
const authError = document.getElementById("authError");
const btnGoogle = document.getElementById("btnGoogle");
const authSection = document.getElementById("authSection");
const successSection = document.getElementById("successSection");
const btnCloseTab = document.getElementById("btnCloseTab");

let authMode = "login"; // "login" or "register"

// Switch to Sign In Tab
tabSignIn.addEventListener("click", () => {
  authMode = "login";
  tabSignIn.classList.add("active");
  tabSignUp.classList.remove("active");
  nameGroup.style.display = "none";
  authName.required = false;
  btnSubmit.textContent = "Sign In";
  authError.style.display = "none";
});

// Switch to Sign Up Tab
tabSignUp.addEventListener("click", () => {
  authMode = "register";
  tabSignUp.classList.add("active");
  tabSignIn.classList.remove("active");
  nameGroup.style.display = "flex";
  authName.required = true;
  btnSubmit.textContent = "Sign Up";
  authError.style.display = "none";
});

// Sync Auth status with Extension Storage
async function syncAuthWithExtension(user, displayName) {
  const name = displayName || user.displayName || user.email.split("@")[0];
  const authData = {
    synapse_auth_status: true,
    synapse_auth_user: {
      uid: user.uid,
      email: user.email,
      name: name
    }
  };

  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(authData, () => {
        console.log("Synapse: Local storage authentication synced successfully.");
        // Notify service worker/background script
        chrome.runtime.sendMessage({ action: "authChange", user: authData.synapse_auth_user }, () => {
          resolve();
        });
      });
    } else {
      // Hosted website path: send message externally
      // Try to query active extension id or send message if extension is connected
      console.log("Not in chrome extension context directly. Attempting external connection message...");
      resolve();
    }
  });
}

// Handle Form Submit (Sign In / Sign Up)
document.getElementById("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.style.display = "none";
  btnSubmit.disabled = true;
  const originalText = btnSubmit.textContent;
  btnSubmit.textContent = "Please wait...";

  const email = authEmail.value.trim();
  const password = authPassword.value;
  const name = authName.value.trim();

  try {
    let userCredential;
    const now = new Date().toISOString();

    if (authMode === "login") {
      userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update last login in Firestore
      const userDocRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        await updateDoc(userDocRef, { lastLogin: now });
      } else {
        await setDoc(userDocRef, {
          uid: user.uid,
          name: user.displayName || email.split("@")[0],
          email: email,
          createdAt: now,
          lastLogin: now
        });
      }
      
      await syncAuthWithExtension(user, userSnap.exists() ? userSnap.data().name : null);

    } else {
      // Sign Up Flow
      userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Set display name in Firebase Auth
      await updateProfile(user, { displayName: name });

      // Create profile document in Firestore
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: name,
        email: email,
        createdAt: now,
        lastLogin: now
      });

      await syncAuthWithExtension(user, name);
    }

    // On success
    showSuccess();

  } catch (err) {
    console.error("Auth error:", err);
    authError.textContent = err.message.replace("Firebase: ", "");
    authError.style.display = "block";
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = originalText;
  }
});

// Google Sign-In
btnGoogle.addEventListener("click", async () => {
  authError.style.display = "none";
  btnGoogle.disabled = true;
  const originalHtml = btnGoogle.innerHTML;
  btnGoogle.innerHTML = "Signing in...";

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const now = new Date().toISOString();

    // Check profile
    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);
    let displayName = user.displayName || user.email.split("@")[0];

    if (!userSnap.exists()) {
      await setDoc(userDocRef, {
        uid: user.uid,
        name: displayName,
        email: user.email,
        createdAt: now,
        lastLogin: now
      });
    } else {
      displayName = userSnap.data().name || displayName;
      await updateDoc(userDocRef, { lastLogin: now });
    }

    await syncAuthWithExtension(user, displayName);
    showSuccess();

  } catch (err) {
    console.error("Google Auth error:", err);
    authError.textContent = "Google login failed. Please try again.";
    authError.style.display = "block";
  } finally {
    btnGoogle.disabled = false;
    btnGoogle.innerHTML = originalHtml;
  }
});

// Success state transition
function showSuccess() {
  authSection.style.display = "none";
  successSection.style.display = "flex";
}

// Close tab or redirect
btnCloseTab.addEventListener("click", () => {
  window.close();
});
