// Storage can be unavailable (private mode, blocked site data), so never let it throw.
const KEY = 'lct.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // Signed in for this tab only.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
