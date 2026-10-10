import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { api, parseServerDate, type CashShift, type Permission } from "../lib/api";
import { DRAWER_CHANGED } from "../lib/shellEvents";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { Icon, type IconName } from "./icons";
import { Status } from "./ui";

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
    title: "Review",
    items: [
      { to: "/", label: "Today", icon: "dashboard" },
      { to: "/reports", label: "Reports", icon: "reports", anyOf: ["reports.inventory", "reports.sales"] },
      { to: "/assistant", label: "Assistant", icon: "assistant", anyOf: ["ai.use"] },
    ],
  },
  {
    title: "Admin",
    items: [
      { to: "/users", label: "Users", icon: "users", anyOf: ["users.manage"] },
      { to: "/moph", label: "MoPH catalogue", icon: "moph", anyOf: ["catalog.import"] },
      { to: "/backup", label: "Backup", icon: "backup", anyOf: ["backup.create"] },
      { to: "/profile", label: "Pharmacy profile", icon: "profile", anyOf: ["settings.manage"] },
      { to: "/settings", label: "Settings", icon: "settings", anyOf: ["settings.manage", "settings.exchange_rate"] },
    ],
  },
];

const ROLE_LABEL = { owner: "Owner", pharmacist: "Pharmacist", cashier: "Cashier" } as const;
const timeOf = (iso: string) => parseServerDate(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Live state shown in the running header: the cash drawer and (for owners) backup health. */
function useShellStatus(canDrawer: boolean, canBackup: boolean, pathname: string) {
  const [drawer, setDrawer] = useState<CashShift | null | undefined>(undefined);
  const [backupWarning, setBackupWarning] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (canDrawer) {
      api.getCurrentShift().then((c) => setDrawer(c.shift)).catch(() => setDrawer(undefined));
    }
    if (canBackup) {
      api.getBackupStatus().then((s) => setBackupWarning(s.stale || s.warnings.length ? s.warnings[0] ?? "Backup overdue" : null)).catch(() => setBackupWarning(null));
    }
  }, [canDrawer, canBackup]);

  useEffect(refresh, [refresh, pathname]);
  useEffect(() => {
    window.addEventListener(DRAWER_CHANGED, refresh);
    const timer = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener(DRAWER_CHANGED, refresh);
      clearInterval(timer);
    };
  }, [refresh]);

  return { drawer, backupWarning };
}

export default function Layout() {
  const { user, logout, can } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pharmacyName = settings?.name?.trim() || "PharmaCore Pharmacy";
  const { drawer, backupWarning } = useShellStatus(can("cash.drawer"), can("backup.create"), location.pathname);

  useEffect(() => setNavOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((item) => !item.anyOf || item.anyOf.some((p) => can(p))),
      })).filter((g) => g.items.length > 0),
    [can],
  );
  const paletteItems: PaletteItem[] = useMemo(
    () => [
      ...groups.flatMap((g) => g.items.map((i) => ({ to: i.to, label: i.label, icon: i.icon, group: g.title }))),
      { to: "/account", label: "My account", icon: "users", group: "You" },
    ],
    [groups],
  );

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const index = (
    <aside className="flex h-full w-60 flex-col border-r border-rule bg-paper-2">
      <div className="shrink-0 px-4 pt-4 pb-3">
        <p className="flex items-center gap-1.5 text-2xs font-semibold tracking-[0.12em] text-ink-3 uppercase">
          <span className="h-2 w-2 bg-lime-400" aria-hidden />
          PharmaCore
        </p>
        <p className="mt-1 font-serif text-[17px] leading-snug font-semibold text-ink" title={pharmacyName}>
          {pharmacyName}
        </p>
      </div>

      <div className="shrink-0 px-3 pb-2">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex min-h-9 w-full items-center gap-2 rounded-sm border border-rule-strong bg-paper-0 px-2.5 text-dense text-ink-3 hover:border-line-input hover:text-ink-2"
        >
          <Icon name="search" className="h-4 w-4" />
          <span className="flex-1 text-left">Go to…</span>
          <span className="kbd">Ctrl K</span>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-4" aria-label="Main">
        {groups.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="px-2 pb-1 text-2xs font-semibold tracking-[0.09em] text-ink-3 uppercase">{group.title}</p>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `relative flex min-h-[34px] items-center gap-2.5 rounded-sm px-2 text-sm transition-colors ${
                    isActive
                      ? "bg-paper-0 font-semibold text-ink before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:bg-lime-400"
                      : "text-ink-2 hover:bg-paper-3/60 hover:text-ink"
                  }`
                }
              >
                <Icon name={item.icon} className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-1 border-t border-rule px-3 py-2.5">
        <NavLink
          to="/account"
          className={({ isActive }) => `flex min-h-10 min-w-0 flex-1 flex-col justify-center rounded-sm px-2 ${isActive ? "bg-paper-0" : "hover:bg-paper-3/60"}`}
        >
          <span className="truncate text-sm font-medium text-ink">{user?.full_name || user?.username}</span>
          <span className="text-xs text-ink-3">{user ? ROLE_LABEL[user.role] : ""}</span>
        </NavLink>
        <button type="button" onClick={logout} className="btn btn-ghost btn-icon" aria-label="Log out" title="Log out">
          <Icon name="logout" className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-full overflow-hidden">
      <div className="hidden h-full shrink-0 xl:block">{index}</div>

      {navOpen ? (
        <div className="fixed inset-0 z-40 xl:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setNavOpen(false)} />
          <div className="relative h-full w-60 shadow-overlay">{index}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-10 shrink-0 items-center gap-x-5 gap-y-1 border-b border-rule bg-paper px-4 py-1.5 text-dense lg:px-6">
          <button type="button" className="btn btn-ghost btn-sm btn-icon -ml-2 xl:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <span className="truncate font-serif font-semibold text-ink xl:hidden">{pharmacyName}</span>
          <span className="hidden text-ink-2 xl:inline">{today}</span>

          <div className="ml-auto flex items-center gap-x-5">
            {backupWarning ? (
              <Link to="/backup" className="hidden hover:underline md:inline-flex" title={backupWarning}>
                <Status tone="caution" icon="alert">Backup needs attention</Status>
              </Link>
            ) : null}
            {drawer === null ? (
              <Link to="/cash" className="hover:underline">
                <Status tone="caution" icon="cash">Drawer closed</Status>
              </Link>
            ) : drawer ? (
              <Link to="/cash" className="hidden hover:underline sm:inline-flex" title={`Opened by ${drawer.opened_by_name ?? "—"}`}>
                <Status tone="ok" icon="cash">
                  Drawer open <span className="font-normal text-ink-3">since {timeOf(drawer.opened_at)}</span>
                </Status>
              </Link>
            ) : null}
            {settings ? (
              <span className="hidden font-mono text-xs text-ink-2 sm:inline" title="Exchange rate used for LBP">
                1 USD = {settings.exchange_rate.toLocaleString()} LBP
              </span>
            ) : null}
          </div>
        </header>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 pt-4 pb-4 lg:px-6 lg:pt-5">
          <Outlet />
        </main>
      </div>

      <CommandPalette items={paletteItems} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
