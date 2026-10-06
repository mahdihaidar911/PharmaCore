import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/pos", label: "POS" },
  { to: "/products", label: "Products" },
  { to: "/moph", label: "MoPH sync" },
  { to: "/receive", label: "Receive Stock" },
  { to: "/inventory", label: "Inventory" },
  { to: "/sales", label: "Sales" },
  { to: "/returns", label: "Returns" },
  { to: "/reports", label: "Reports" },
  { to: "/backup", label: "Backup" },
  { to: "/profile", label: "Profile" },
  { to: "/settings", label: "Settings" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const pharmacyName = settings?.name?.trim() || "PharmaCore Pharmacy";

  return (
    <div className="flex h-full overflow-hidden lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-slate-200 bg-slate-900 lg:h-full lg:w-64 lg:border-b-0 lg:border-r">
        <div className="shrink-0 border-b border-slate-700 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-400">PharmaCore</p>
          <h1 className="mt-1 text-lg font-semibold text-white">{pharmacyName}</h1>
          <p className="mt-1 text-sm text-slate-400">Signed in as {user?.username}</p>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-3 py-3 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
                  isActive ? "bg-teal-600 text-white" : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="shrink-0 px-3 pb-4">
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-100 p-4 lg:p-6">
        <Outlet />
      </main>
    </div>
  );
}
