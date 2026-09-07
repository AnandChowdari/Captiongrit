/**
 * Captiongrit Command Center — Auth & Credential Manager
 *
 * CREDENTIAL SAFETY RULES:
 * - appsScriptUrl may be stored in localStorage.
 * - adminSecret is kept in runtime memory by default.
 * - Persisting secret to localStorage is an explicit opt-in (rememberSecret).
 * - "Forget Credentials" clears runtime memory and localStorage immediately.
 * - Secrets are NEVER logged, included in URLs, or exposed in error messages.
 */

let memoryAdminSecret = '';

const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbzcduRbPRxFLYLMOB5oOXPZqazf4_xlqwWz3zBjKG-R6h3QSSdhI7aZvv2a7ALHvLxn/exec';

export const authService = {
  getAppsScriptUrl() {
    return localStorage.getItem('cg_apps_script_url') || DEFAULT_URL;
  },

  setAppsScriptUrl(url) {
    if (url) {
      localStorage.setItem('cg_apps_script_url', url.trim());
    }
  },

  getAdminSecret() {
    if (memoryAdminSecret) return memoryAdminSecret;
    const stored = localStorage.getItem('cg_admin_secret');
    if (stored) {
      memoryAdminSecret = stored;
      return stored;
    }
    return '';
  },

  setAdminSecret(secret, remember = false) {
    const trimmed = (secret || '').trim();
    memoryAdminSecret = trimmed;
    if (remember && trimmed) {
      localStorage.setItem('cg_admin_secret', trimmed);
    } else {
      localStorage.removeItem('cg_admin_secret');
    }
  },

  isRemembered() {
    return !!localStorage.getItem('cg_admin_secret');
  },

  forgetCredentials() {
    memoryAdminSecret = '';
    localStorage.removeItem('cg_admin_secret');
    localStorage.removeItem('cg_apps_script_url');
  },

  isAuthenticated() {
    return !!this.getAdminSecret();
  }
};

export const getStoredAppsScriptUrl = () => authService.getAppsScriptUrl();
export const getStoredAdminSecret = () => authService.getAdminSecret();
export const isSecretPersisted = () => authService.isRemembered();
export const setStoredCredentials = (url, secret, remember) => {
  authService.setAppsScriptUrl(url);
  authService.setAdminSecret(secret, remember);
};
export const forgetCredentials = () => authService.forgetCredentials();

export default authService;
