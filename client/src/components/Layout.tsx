import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import type { Permission } from "../lib/api";
import { Icon, type IconName } from "./icons";

type NavItem = { to: string; label: string; icon: IconName; anyOf?: Permission[] };

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Sell",
    items: [
      { to: "/pos", label: "Point of sale", icon: "pos", anyOf: ["pos.sell"] },
      { to: "/cash", label: "Cash drawer", icon: "cash", anyOf: ["cash.drawer"] },
      { to: "/sales", label: "Sales history", icon: "sales", anyOf: ["sales.view"] },
      { to: "/returns", label: "Returns", icon: "returns", anyOf: ["returns.create"] },
    ],
  },
  {
    title: "Stock",
    items: [
      { to: "/products", label: "Products", icon: "products", anyOf: ["products.view"] },
      { to: "/receive", label: "Receive stock", icon: "receive", anyOf: ["inventory.receive"] },
      { to: "/inventory", label: "Inventory", icon: "inventory", anyOf: ["inventory.view"] },
    ],
  },
  {
    title: "Insights",
    items: [
      { to: "/", label: "Dashboard", icon: "dashboard" },
      { to: "/reports", label: "Reports", icon: "reports", anyOf: ["reports.inventory", "reports.sales"] },
      { to: "/assistant", label: "AI assistant", icon: "assistant", anyOf: ["ai.use"] },
    ],
  },
  {
    title: "Admin",
    items: [
      { to: "/users", label: "Users", icon: "users", anyOf: ["users.manage"] },
      { to: "/moph", label: "MoPH sync", icon: "moph", anyOf: ["catalog.import"] },
      { to: "/backup", label: "Backup", icon: "backup", anyOf: ["backup.create"] },
      { to: "/profile", label: "Pharmacy profile", icon: "profile", anyOf: ["settings.manage"] },
      { to: "/settings", label: "Settings", icon: "settings", anyOf: ["settings.manage", "settings.exchange_rate"] },
    ],
  },
];

const ROLE_LABEL = { owner: "Owner", pharmacist: "Pharmacist", cashier: "Cashier" } as const;

export default function Layout() {
  const { user, logout, can } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pharmacyName = settings?.name?.trim() || "PharmaCore Pharmacy";

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => !item.anyOf || item.anyOf.some((p) => can(p))),
  })).filter((g) => g.items.length > 0);

  const sidebar = (
    <aside className="flex h-full w-64 flex-col bg-slate-900 text-slate-300">
      <div className="shrink-0 border-b border-slate-800 px-5 py-4">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-brand-500 uppercase">PharmaCore</p>
        <p className="mt-1 truncate text-base font-semibold text-white" title={pharmacyName}>
          {pharmacyName}
        </p>
        {settings ? (
          <p className="mt-1 text-xs text-slate-400">1 USD = {settings.exchange_rate.toLocaleString()} LBP</p>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{group.title}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? "bg-brand-700 text-white" : "hover:bg-slate-800 hover:text-white"
                    }`
                  }
                >
                  <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-slate-800 p-3">
        <NavLink
          to="/account"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 ${isActive ? "bg-slate-800" : "hover:bg-slate-800"}`
          }
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white uppercase">
            {(user?.full_name || user?.username || "?").slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-white">{user?.full_name || user?.username}</span>
            <span className="block text-xs text-slate-400">{user ? ROLE_LABEL[user.role] : ""}</span>
          </span>
        </NavLink>
        <button type="button" onClick={logout} className="mt-2 flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm hover:bg-slate-800">
          <Icon name="logout" className="h-[18px] w-[18px]" />
          Log out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-full overflow-hidden">
      <div className="hidden h-full shrink-0 lg:block">{sidebar}</div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawerOpen(false)} />
          <div className="relative h-full w-64 shadow-xl">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
          <button type="button" className="btn btn-ghost px-2" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <p className="truncate font-semibold text-slate-900">{pharmacyName}</p>
          {settings ? <span className="ml-auto text-xs text-slate-500">1 USD = {settings.exchange_rate.toLocaleString()} LBP</span> : null}
        </header>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-100 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
