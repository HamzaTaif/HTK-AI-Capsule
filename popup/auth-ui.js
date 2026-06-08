import { loginUser, registerUser, loginWithGoogle, logoutUser, onAuthStateChange, resetPassword, getCurrentUser } from "./auth.js";
import { getUserProfile, updateUserProfile } from "./profile.js";
import { changePassword } from "./security.js";

export function initAuthUI(onAuthSuccess) {
  const screens = {
    auth: document.getElementById('authScreen'),
    main: document.getElementById('mainAppScreen'),
    profile: document.getElementById('profileScreen'),
    security: document.getElementById('securityScreen'),
    about: document.getElementById('aboutScreen'),
    guidelines: document.getElementById('guidelinesScreen'),
    contact: document.getElementById('contactScreen'),
    dashboard: document.getElementById('dashboardScreen')
  };

  let isAuthSynced = false;
  chrome.storage.local.get(['synapse_auth_status'], (result) => {
    isAuthSynced = !!result.synapse_auth_status;
    if (isAuthSynced) {
      showScreen('dashboard');
    } else {
      showScreen('auth');
    }
  });

  // Listen to chrome storage changes to sync login/logout state instantly
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.synapse_auth_status !== undefined) {
      isAuthSynced = !!changes.synapse_auth_status.newValue;
      if (isAuthSynced) {
        showScreen('dashboard');
      } else {
        showScreen('auth');
      }
    }
  });

  function showScreen(screenId) {
    if (!isAuthSynced && screenId !== 'auth') {
      screenId = 'auth';
    }
    Object.values(screens).forEach(s => {
      if (s) s.classList.remove('active');
    });
    if (screens[screenId]) {
      screens[screenId].classList.add('active');
    }
  }

  // Header & Dropdown
  const headerAvatar = document.getElementById('headerAvatar');
  const profileDropdown = document.getElementById('profileDropdown');
  
  if (headerAvatar) {
    headerAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle('show');
    });
  }

  document.addEventListener('click', (e) => {
    if (profileDropdown && profileDropdown.classList.contains('show') && !e.target.closest('#headerAvatar') && !e.target.closest('#profileDropdown')) {
      profileDropdown.classList.remove('show');
    }
  });

  // Nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target) {
        // If navigating away from main, close dropdown
        if (target !== 'mainAppScreen' && profileDropdown) {
          profileDropdown.classList.remove('show');
        }
        showScreen(target.replace('Screen', ''));
      }
    });
  });

  // Auth Tabs
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const nameFieldContainer = document.getElementById('nameFieldContainer');
  const btnAuthSubmit = document.getElementById('btnAuthSubmit');
  const authError = document.getElementById('authError');
  let authMode = 'login';

  if (tabLogin && tabRegister) {
    tabLogin.addEventListener('click', () => {
      authMode = 'login';
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      nameFieldContainer.style.display = 'none';
      btnAuthSubmit.innerText = 'Sign In';
      authError.style.display = 'none';
      const forgotLink = document.getElementById('forgotPasswordLink');
      if (forgotLink) forgotLink.style.display = 'block';
    });

    tabRegister.addEventListener('click', () => {
      authMode = 'register';
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      nameFieldContainer.style.display = 'flex';
      btnAuthSubmit.innerText = 'Sign Up';
      authError.style.display = 'none';
      const forgotLink = document.getElementById('forgotPasswordLink');
      if (forgotLink) forgotLink.style.display = 'none';
    });
  }

  // Forgot Password
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
      e.preventDefault();
      authError.style.display = 'none';
      const email = document.getElementById('authEmail').value.trim();
      if (!email) {
        authError.innerText = "Please enter your email address first.";
        authError.style.display = 'block';
        return;
      }
      try {
        forgotPasswordLink.innerText = 'Sending...';
        await resetPassword(email);
        authError.style.color = 'var(--success)';
        authError.innerText = "Password reset email sent. Please check your inbox.";
        authError.style.display = 'block';
      } catch (err) {
        authError.style.color = 'var(--error)';
        authError.innerText = err.message.replace('Firebase: ', '');
        authError.style.display = 'block';
      } finally {
        forgotPasswordLink.innerText = 'Forgot?';
        setTimeout(() => { authError.style.color = 'var(--error)'; }, 3000); // Reset color
      }
    });
  }

  // Auth Submit
  const authForm = document.getElementById('authForm');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      authError.style.display = 'none';
      btnAuthSubmit.disabled = true;
      btnAuthSubmit.innerText = 'Please wait...';

      const email = document.getElementById('authEmail').value;
      const pass = document.getElementById('authPassword').value;
      
      try {
        if (authMode === 'login') {
          await loginUser(email, pass);
        } else {
          const name = document.getElementById('authName').value;
          await registerUser(name, email, pass);
        }
      } catch (error) {
        console.error("Auth error:", error);
        authError.innerText = error.message.replace('Firebase: ', '');
        authError.style.display = 'block';
      } finally {
        btnAuthSubmit.disabled = false;
        btnAuthSubmit.innerText = authMode === 'login' ? 'Sign In' : 'Sign Up';
      }
    });
  }

  // Google Login
  const btnGoogleLogin = document.getElementById('btnGoogleLogin');
  if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener('click', async () => {
      try {
        btnGoogleLogin.disabled = true;
        btnGoogleLogin.innerHTML = 'Please wait...';
        await loginWithGoogle();
      } catch (err) {
        console.error("Google Auth error:", err);
        let errorMsg = err.message;
        if (errorMsg.includes("popup-closed")) {
          errorMsg = "Sign-in popup was closed before finishing.";
        } else if (errorMsg.includes("network")) {
          errorMsg = "Network error. Please check your connection.";
        } else {
          errorMsg = "Google Sign-In failed. Please try again or use email.";
        }
        authError.innerText = errorMsg;
        authError.style.display = 'block';
      } finally {
        btnGoogleLogin.disabled = false;
        btnGoogleLogin.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C18.155 2.185 15.43 1 12.24 1 5.48 1 0 6.48 0 13.24s5.48 12.24 12.24 12.24c7.06 0 11.758-4.965 11.758-11.966 0-.807-.087-1.427-.193-2.23H12.24z"/></svg> Continue with Google';
      }
    });
  }

  // Launch Auth Web Portal
  const btnLaunchAuth = document.getElementById('btnLaunchAuth');
  if (btnLaunchAuth) {
    btnLaunchAuth.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
      window.close();
    });
  }

  // Logout
  const navLogoutBtn = document.getElementById('navLogoutBtn');
  if (navLogoutBtn) {
    navLogoutBtn.addEventListener('click', async () => {
      chrome.storage.local.set({ synapse_auth_status: false, synapse_auth_user: null }, async () => {
        await logoutUser();
        if (profileDropdown) profileDropdown.classList.remove('show');
        chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
        window.close();
      });
    });
  }

  // Profile Form
  const profileForm = document.getElementById('profileForm');
  const profileMsg = document.getElementById('profileMsg');
  const btnSaveProfile = document.getElementById('btnSaveProfile');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      profileMsg.style.display = 'none';
      btnSaveProfile.disabled = true;
      btnSaveProfile.innerText = 'Saving...';
      
      try {
        const name = document.getElementById('profileName').value;
        await updateUserProfile(name);
        profileMsg.innerText = 'Profile updated successfully!';
        profileMsg.style.color = 'var(--success)';
        profileMsg.style.display = 'block';
        
        // Update profile display names
        const dispName = document.getElementById('profileNameDisplay');
        if (dispName) dispName.innerText = name;

        // Update avatar text
        if (headerAvatar) {
          headerAvatar.innerText = name.substring(0, 2).toUpperCase();
        }
        document.getElementById('profileImagePreview').innerText = name.substring(0, 2).toUpperCase();
        
      } catch (err) {
        profileMsg.innerText = err.message;
        profileMsg.style.color = 'var(--error)';
        profileMsg.style.display = 'block';
      } finally {
        btnSaveProfile.disabled = false;
        btnSaveProfile.innerText = 'Save Changes';
      }
    });
  }

  // Security Form
  const securityForm = document.getElementById('securityForm');
  const securityError = document.getElementById('securityError');
  const securitySuccess = document.getElementById('securitySuccess');
  const btnUpdatePassword = document.getElementById('btnUpdatePassword');
  
  if (securityForm) {
    securityForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      securityError.style.display = 'none';
      securitySuccess.style.display = 'none';
      
      const currentPass = document.getElementById('secCurrentPassword').value;
      const newPass = document.getElementById('secNewPassword').value;
      const confirmPass = document.getElementById('secConfirmPassword').value;
      
      if (newPass !== confirmPass) {
        securityError.innerText = "New passwords do not match";
        securityError.style.display = 'block';
        return;
      }
      
      btnUpdatePassword.disabled = true;
      btnUpdatePassword.innerText = 'Updating...';
      
      try {
        await changePassword(currentPass, newPass);
        securitySuccess.style.display = 'block';
        securityForm.reset();
      } catch (err) {
        securityError.innerText = err.message.replace('Firebase: ', '');
        securityError.style.display = 'block';
      } finally {
        btnUpdatePassword.disabled = false;
        btnUpdatePassword.innerText = 'Update Password';
      }
    });
  }

  // Send Password Reset Email (from Security Screen)
  const btnResetPasswordEmail = document.getElementById('btnResetPasswordEmail');
  if (btnResetPasswordEmail) {
    btnResetPasswordEmail.addEventListener('click', async () => {
      securityError.style.display = 'none';
      securitySuccess.style.display = 'none';
      const user = getCurrentUser();
      if (!user || !user.email) {
        securityError.innerText = "No authenticated user or email found.";
        securityError.style.display = 'block';
        return;
      }
      btnResetPasswordEmail.disabled = true;
      btnResetPasswordEmail.innerText = 'Sending Reset Email...';
      try {
        await resetPassword(user.email);
        securitySuccess.innerText = "Password reset email sent. Please check your inbox.";
        securitySuccess.style.display = 'block';
      } catch (err) {
        securityError.innerText = err.message.replace('Firebase: ', '');
        securityError.style.display = 'block';
      } finally {
        btnResetPasswordEmail.disabled = false;
        btnResetPasswordEmail.innerText = '📧 Send Password Reset Email';
      }
    });
  }

  // Listen to Auth State
  onAuthStateChange(async (user) => {
    if (user) {
      showScreen('dashboard');
      if (headerAvatar) {
        headerAvatar.style.display = 'flex';
      }
      
      try {
        const profile = await getUserProfile();
        // Setup Avatar
        let initials = (profile.name || user.email).substring(0, 2).toUpperCase();
        if (headerAvatar) {
          if (profile.photoURL) {
            headerAvatar.style.backgroundImage = `url(${profile.photoURL})`;
            headerAvatar.innerText = '';
          } else {
            headerAvatar.style.backgroundImage = 'none';
            headerAvatar.innerText = initials;
          }
        }
        
        // Populate Profile Screen
        const preview = document.getElementById('profileImagePreview');
        if (preview) {
          if (profile.photoURL) {
            preview.style.backgroundImage = `url(${profile.photoURL})`;
            preview.innerText = '';
          } else {
            preview.style.backgroundImage = 'none';
            preview.innerText = initials;
          }
        }
        
        document.getElementById('profileName').value = profile.name || '';
        document.getElementById('profileEmail').value = profile.email || '';
        
        const dispName = document.getElementById('profileNameDisplay');
        if (dispName) dispName.innerText = profile.name || 'Anonymous';
        const dispEmail = document.getElementById('profileEmailDisplay');
        if (dispEmail) dispEmail.innerText = profile.email || '';

        document.getElementById('profileProviderDisplay').innerText = profile.provider === 'google' ? 'Google' : 'Email/Password';
        
        if (profile.createdAt) {
          const date = new Date(profile.createdAt);
          document.getElementById('profileJoinedDisplay').innerText = date.toLocaleDateString();
        }
        
        // Handle Security Screen visibility
        if (profile.provider === 'google') {
          document.getElementById('securityForm').style.display = 'none';
          document.getElementById('securityGoogleMsg').style.display = 'block';
        } else {
          document.getElementById('securityForm').style.display = 'block';
          document.getElementById('securityGoogleMsg').style.display = 'none';
        }
        
      } catch (err) {
        console.error("Failed to load profile:", err);
      }
      
      // Callback to popup.js to load capsules and vault
      if (onAuthSuccess) onAuthSuccess(user);
      
    } else {
      showScreen('auth');
      if (headerAvatar) headerAvatar.style.display = 'none';
      if (profileDropdown) profileDropdown.classList.remove('show');
    }
  });
}
