import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as authService from "../api/authService";
import { getAuth, onAuthChange } from "../api/tokenStorage";
import { setSessionExpiredHandler } from "../api/http";

// status: "loading" (session check chal raha hai) | "authed" | "guest"
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (getAuth() ? "loading" : "guest"));
  const loginPromiseRef = useRef(null);

  const toGuest = useCallback(() => {
    setUser(null);
    setStatus("guest");
  }, []);

  // ---------- Reload par session restore (GET /auth/me) ----------
  // Token expire ho to http.js khud refresh karke retry karega.
  useEffect(() => {
    if (!getAuth()) return;
    let cancelled = false;

    authService
      .getCurrentUser()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setStatus("authed");
      })
      .catch(() => {
        if (cancelled) return;
        toGuest(); // token kharab ya expire, dobara login karna hoga
      });

    return () => {
      cancelled = true;
    };
  }, [toGuest]);

  // ---------- Refresh fail hone par http.js yahi bulata hai ----------
  useEffect(() => {
    setSessionExpiredHandler(toGuest);
    return () => setSessionExpiredHandler(null);
  }, [toGuest]);

  // ---------- Multi-tab: doosre tab mein logout/login ----------
  useEffect(() => {
    return onAuthChange((auth) => {
      if (!auth) {
        toGuest(); // doosre tab mein logout -> yahan bhi logout
        return;
      }
      // Doosre tab mein login hua: yahan bhi session restore karo
      authService
        .getCurrentUser()
        .then((u) => {
          setUser(u);
          setStatus("authed");
        })
        .catch(toGuest);
    });
  }, [toGuest]);

  // ---------- Login (double click safe) ----------
  // Request chal rahi ho to naya call wahi promise lauta deta hai, doosri request nahi jaati.
  const login = useCallback((username, password) => {
    if (loginPromiseRef.current) return loginPromiseRef.current;

    const promise = authService
      .login(username, password)
      .then((u) => {
        setUser(u);
        setStatus("authed");
        return u;
      })
      .finally(() => {
        loginPromiseRef.current = null;
      });

    loginPromiseRef.current = promise;
    return promise;
  }, []);

  const logout = useCallback(() => {
    authService.logout(); // token hataya -> doosre tabs ko storage event mil jaata hai
    toGuest();
  }, [toGuest]);

  const value = useMemo(
    () => ({ user, status, isAuthed: status === "authed", login, logout }),
    [user, status, login, logout]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}