import { useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { FullScreenSpinner } from "../components/ProtectedRoute";

export default function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false); // state async hai, ref turant update hota hai

  // Login ke baad wapas usi page par (query ke saath), warna home
  const from = location.state?.from;
  const redirectTo = from ? `${from.pathname}${from.search}` : "/";

  if (status === "loading") return <FullScreenSpinner label="Checking session..." />;
  if (status === "authed") return <Navigate to={redirectTo} replace />;

  function validate() {
    const errors = {};
    if (!username.trim()) errors.username = "Username is required";
    if (!password) errors.password = "Password is required";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submittingRef.current) return; // double click / double Enter: ignore
    setFormError("");
    if (!validate()) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await login(username, password);
      // Success par status "authed" ho jaata hai, upar wala Navigate redirect kar deta hai
    } catch (err) {
      setFormError(err?.message || "Login failed. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const inputClass = (hasError) =>
    `mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${
      hasError ? "border-red-500" : "border-slate-300"
    }`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow"
      >
        <h1 className="text-xl font-semibold text-slate-900">Calendar Scheduler</h1>
        <p className="mt-1 text-sm text-slate-500">Log in to continue</p>

        {formError && (
          <div
            role="alert"
            className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {formError}
          </div>
        )}

        <div className="mt-4">
          <label htmlFor="username" className="text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            aria-invalid={Boolean(fieldErrors.username)}
            aria-describedby={fieldErrors.username ? "username-error" : undefined}
            className={inputClass(fieldErrors.username)}
          />
          {fieldErrors.username && (
            <p id="username-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.username}
            </p>
          )}
        </div>

        <div className="mt-4">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? "password-error" : undefined}
            className={inputClass(fieldErrors.password)}
          />
          {fieldErrors.password && (
            <p id="password-error" className="mt-1 text-xs text-red-600">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Logging in..." : "Log in"}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Test user: emilys / emilyspass
        </p>
      </form>
    </main>
  );
}