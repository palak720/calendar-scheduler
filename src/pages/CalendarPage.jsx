import { useAuth } from "../store/AuthContext";
import { useCalendarState } from "../store/CalendarContext";

// Placeholder: asli calendar UI baad mein isi file ko replace karega
export default function CalendarPage() {
  const { user, logout } = useAuth();
  const { ready, events, loadError } = useCalendarState();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Hello, {user?.firstName}</h1>
        <button
          onClick={logout}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
        >
          Log out
        </button>
      </div>
      <p className="mt-4 text-slate-600">
        {loadError
          ? `Error: ${loadError}`
          : ready
          ? `${events.length} events loaded`
          : "Loading events..."}
      </p>
    </div>
  );
}