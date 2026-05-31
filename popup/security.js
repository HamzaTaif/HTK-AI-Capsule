import { auth, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "./firebase.js";

export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  
  if (user.providerData.some(p => p.providerId === 'google.com')) {
    throw new Error("Password changes must be managed through Google.");
  }
  
  // Re-authenticate first
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  
  // Update password
  await updatePassword(user, newPassword);
}
