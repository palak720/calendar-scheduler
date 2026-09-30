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

        <Route element={<ProtectedRoute />}>
          {/* /events/:id child route hai: CalendarPage mounted rehta hai,
              details dialog uske upar khulta hai. Refresh par wahi dialog dobara khulta hai. */}
          <Route path="/" element={<CalendarPage />}>
            <Route path="events/:id" element={null} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}