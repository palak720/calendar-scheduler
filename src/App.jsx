import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./store/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import CalendarPage from "./pages/CalendarPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Ye sab pages login ke baad hi khulte hain */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<CalendarPage />} />
          {/* /events/:id route event details ke step mein aayega */}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}