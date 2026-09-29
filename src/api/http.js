import axios from "axios";
import { getAuth, setAuth, clearAuth } from "./tokenStorage";

const BASE_URL = "https://dummyjson.com";

// Testing ke liye 1 kar dena, refresh flow 1 minute mein trigger hoga
export const ACCESS_TOKEN_MINS = 30;

// Main instance: sab service files yahi use karengi
const http = axios.create({ baseURL: BASE_URL, timeout: 15000 });

// Bare instance: sirf refresh call ke liye, taaki interceptor ka loop na bane
const bare = axios.create({ baseURL: BASE_URL, timeout: 15000 });

let refreshPromise = null; // single-flight lock
let onSessionExpired = null;

// AuthContext isko register karega, refresh fail hone par logout ho jayega
export function setSessionExpiredHandler(fn) {
  onSessionExpired = fn;
}

// Har error ka ek hi shape: { status, code, message, details }
function normalizeError(error) {
  if (axios.isCancel(error)) {
    return { status: 0, code: "CANCELLED", message: "Request cancelled", details: null };
  }
  if (error.response) {
    const { status, data } = error.response;
    return {
      status,
      code: "HTTP_ERROR",
      message: (data && data.message) || error.message || "Something went wrong",
      details: data ?? null,
    };
  }
  if (error.code === "ECONNABORTED") {
    return { status: 0, code: "TIMEOUT", message: "Request timed out", details: null };
  }
  return {
    status: 0,
    code: "NETWORK_ERROR",
    message: "Network error. Check your connection.",
    details: null,
  };
}

// Kitni bhi requests fail ho, refresh call sirf ek hoti hai.
// Baaki sab isi promise ka wait karti hain.
function refreshAccessToken() {
  if (!refreshPromise) {
    const auth = getAuth();
    if (!auth) return Promise.reject(new Error("No refresh token"));

    refreshPromise = bare
      .post("/auth/refresh", {
        refreshToken: auth.refreshToken,
        expiresInMins: ACCESS_TOKEN_MINS,
      })
      .then((res) => {
        setAuth({
          accessToken: res.data.accessToken,
          refreshToken: res.data.refreshToken || auth.refreshToken,
        });
        return res.data.accessToken;
      })
      .catch((err) => {
        clearAuth();
        if (onSessionExpired) onSessionExpired();
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Request: token attach karo
http.interceptors.request.use((config) => {
  const auth = getAuth();
  if (auth) config.headers.Authorization = `Bearer ${auth.accessToken}`;
  return config;
});

// Response: 401 -> ek refresh -> retry
http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url = original?.url || "";
    const isAuthCall = url.includes("/auth/login") || url.includes("/auth/refresh");

    if (status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true; // ek request sirf ek baar retry hogi

      // Agar kisi aur request ne token pehle hi refresh kar diya,
      // to naya refresh mat karo, naye token se retry karo.
      const current = getAuth();
      if (current && original.headers.Authorization !== `Bearer ${current.accessToken}`) {
        original.headers.Authorization = `Bearer ${current.accessToken}`;
        return http(original);
      }

      let newToken;
      try {
        newToken = await refreshAccessToken();
      } catch {
        return Promise.reject({
          status: 401,
          code: "SESSION_EXPIRED",
          message: "Session expired. Please log in again.",
          details: null,
        });
      }
      original.headers.Authorization = `Bearer ${newToken}`;
      return http(original);
    }

    return Promise.reject(normalizeError(error));
  }
);

export default http;