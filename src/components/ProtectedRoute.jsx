import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { CalendarProvider } from "../store/CalendarContext";

export function FullScreenSpinner({ label = "Loading..." }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-screen items-center justify-center gap-3 text-slate-600"
    >
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
      <span>{label}</span>
    </div>
  );
}

// Layout route: andar ke saare pages sirf logged-in user ko dikhte hain.
export default function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  // Reload par /auth/me check chal raha hai: na login dikhao, na app
  if (status === "loading") return <FullScreenSpinner label="Restoring session..." />;

  if (status === "guest") {
    // Login ke baad wapas isi page (URL query ke saath) par bhejne ke liye
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // CalendarProvider yahin hai, isliye events sirf login ke baad load hote hain
  // aur logout par provider unmount hokar state reset ho jaati hai.
  return (
    <CalendarProvider>
      <Outlet />
    </CalendarProvider>
  );
}