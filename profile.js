import { db, doc, getDoc, updateDoc } from "./firebase.js";
import { getCurrentUser } from "./auth.js";

export async function getUserProfile() {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  
  const userDoc = await getDoc(doc(db, "users", user.uid));
  if (userDoc.exists()) {
    return userDoc.data();
  }
  
  // Fallback if no doc exists
  return {
    name: user.displayName || user.email.split('@')[0],
    email: user.email,
    provider: user.providerData[0]?.providerId || 'email',
    createdAt: new Date().toISOString()
  };
}

export async function updateUserProfile(name) {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  
  await updateDoc(doc(db, "users", user.uid), {
    name: name
  });
}
