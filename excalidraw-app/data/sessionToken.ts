const SESSION_TOKEN_KEY = "excalidraw-session-user-token";

let cachedToken: string | null = null;

const generateToken = () => {
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const getSessionUserToken = () => {
  if (cachedToken) {
    try {
      window.localStorage.setItem(SESSION_TOKEN_KEY, cachedToken);
    } catch {
      // ignore storage access errors and fallback to in-memory token
    }
    return cachedToken;
  }

  try {
    // Prefer legacy tab token first so existing active-tab identity is kept
    // during migration, then sync it to localStorage for cross-tab identity.
    const legacySessionToken = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (legacySessionToken) {
      cachedToken = legacySessionToken;
      window.localStorage.setItem(SESSION_TOKEN_KEY, legacySessionToken);
      return legacySessionToken;
    }

    // Use localStorage so all tabs in the same browser profile share identity.
    const existingToken = window.localStorage.getItem(SESSION_TOKEN_KEY);
    if (existingToken) {
      cachedToken = existingToken;
      return existingToken;
    }
  } catch {
    // ignore storage access errors and fallback to in-memory token
  }

  const token = generateToken();
  cachedToken = token;
  try {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    // ignore storage access errors and keep in-memory token
  }
  return token;
};

export const getAuthHeaders = () => ({
  Authorization: `Bearer ${getSessionUserToken()}`,
});
