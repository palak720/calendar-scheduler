const KEY = "cs_auth_v1";

// Read tokens safely. Corrupt or missing data returns null.
export function getAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setAuth(auth) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
    })
  );
}

export function clearAuth() {
  localStorage.removeItem(KEY);
}

// Multi-tab logout: the "storage" event fires only in OTHER tabs
// when localStorage changes. Logout in one tab -> key removed ->
// callback runs here with null.
export function onAuthChange(callback) {
  const handler = (e) => {
    if (e.key === KEY || e.key === null) callback(getAuth());
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}