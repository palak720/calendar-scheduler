import http, { ACCESS_TOKEN_MINS } from "./http";
import { setAuth, clearAuth } from "./tokenStorage";

// POST /auth/login
// Token save yahin hota hai, user object wapas jaata hai.
export async function login(username, password) {
  try {
    const { data } = await http.post("/auth/login", {
      username: username.trim(),
      password,
      expiresInMins: ACCESS_TOKEN_MINS,
    });

    setAuth({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });

    // Tokens ko user object se alag kar diya, state mein sirf profile jayegi
    const { accessToken, refreshToken, ...user } = data;
    return user;
  } catch (err) {
    // Galat username/password par DummyJSON 400 deta hai
    if (err.status === 400) {
      throw { ...err, message: "Invalid username or password" };
    }
    throw err;
  }
}

// GET /auth/me : reload par session restore karne ke liye
// Token expire ho to http.js khud refresh karke retry kar dega
export async function getCurrentUser() {
  const { data } = await http.get("/auth/me");
  return data;
}

// Logout: token hatao. Doosre tabs ko storage event se pata chal jayega.
export function logout() {
  clearAuth();
}