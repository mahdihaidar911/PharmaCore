import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { useTheme, type ThemePreference } from "../context/ThemeContext";
import { api, parseServerDate, type CashShift, type Permission } from "../lib/api";
import { DRAWER_CHANGED } from "../lib/shellEvents";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { Icon, type IconName } from "./icons";
import { Toaster } from "./Toaster";

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
const RAIL_KEY = "pharmacore_rail";

/** Live state shown in the command bar: the cash drawer and (for owners) backup health. */
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

/** Rail width: the user's explicit choice wins; otherwise expanded on wide screens. */
function useRailExpanded() {
  const wide = () => window.matchMedia("(min-width: 1280px)").matches;
  const [stored, setStored] = useState<"expanded" | "collapsed" | null>(() => {
    const v = localStorage.getItem(RAIL_KEY);
    return v === "expanded" || v === "collapsed" ? v : null;
  });
  const [isWide, setIsWide] = useState(wide);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const onChange = () => setIsWide(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const expanded = stored ? stored === "expanded" : isWide;
  const toggle = () => {
    const next = expanded ? "collapsed" : "expanded";
    localStorage.setItem(RAIL_KEY, next);
    setStored(next);
  };
  return { expanded, toggle };
}

const THEME_OPTIONS: { value: ThemePreference; icon: IconName; label: string }[] = [
  { value: "light", icon: "sun", label: "Light theme" },
  { value: "system", icon: "monitor", label: "Follow system theme" },
  { value: "dark", icon: "moon", label: "Dark theme" },
];

function ThemeSwitch() {
  const { preference, setPreference } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="flex items-center gap-0.5 rounded-sm bg-frame-2 p-0.5">
      {THEME_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={preference === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => setPreference(o.value)}
          className={`flex h-6 w-7 items-center justify-center rounded-xs transition-colors ${
            preference === o.value ? "bg-frame-3 text-frame-fg" : "text-frame-fg-2 hover:text-frame-fg"
          }`}
        >
          <Icon name={o.icon} className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

export default function Layout() {
  const { user, logout, can } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const rail = useRailExpanded();
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

  const current = useMemo(() => {
    for (const g of groups) {
      const item = g.items.find((i) => (i.to === "/" ? location.pathname === "/" : location.pathname.startsWith(i.to)));
      if (item) return { group: g.title, label: item.label };
    }
    return location.pathname.startsWith("/account") ? { group: "You", label: "My account" } : null;
  }, [groups, location.pathname]);

  const initials = (user?.full_name || user?.username || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const renderRail = (expanded: boolean, onToggle?: () => void) => (
    <aside
      className={`scope-graphite flex h-full flex-col bg-frame text-frame-fg transition-[width] duration-200 ${expanded ? "w-56" : "w-16"}`}
      aria-label="Main navigation"
    >
      <div className={`flex h-12 shrink-0 items-center gap-2.5 ${expanded ? "px-4" : "justify-center"}`}>
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-frame-line bg-frame-2" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-[2px] bg-signal" />
        </span>
        {expanded ? (
          <div className="min-w-0 leading-tight">
            <p className="text-2xs font-semibold tracking-[0.1em] text-frame-fg-2 uppercase">PharmaCore</p>
            <p className="truncate text-dense font-semibold text-frame-fg" title={pharmacyName}>
              {pharmacyName}
            </p>
          </div>
        ) : null}
      </div>

      <nav className={`min-h-0 flex-1 overflow-y-auto pt-2 pb-3 ${expanded ? "px-3" : "px-2"}`} style={{ scrollbarWidth: "none" }}>
        {groups.map((group, gi) => (
          <div key={group.title} className={gi > 0 ? (expanded ? "mt-4" : "mt-2 border-t border-frame-line pt-2") : ""}>
            {expanded ? <p className="px-2.5 pb-1 text-2xs font-semibold tracking-[0.1em] text-frame-fg-2/80 uppercase">{group.title}</p> : null}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                title={expanded ? undefined : item.label}
                aria-label={expanded ? undefined : item.label}
                className={({ isActive }) =>
                  `group relative flex h-9 items-center gap-3 rounded-sm text-dense transition-colors ${expanded ? "px-2.5" : "justify-center"} ${
                    isActive
                      ? "bg-frame-3 font-semibold text-frame-fg before:absolute before:inset-y-2 before:left-0 before:w-[2px] before:rounded-full before:bg-signal"
                      : "text-frame-fg-2 hover:bg-frame-2 hover:text-frame-fg"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon name={item.icon} className={`h-[18px] w-[18px] ${isActive ? "text-signal" : ""}`} />
                    {expanded ? <span className="truncate">{item.label}</span> : null}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className={`shrink-0 border-t border-frame-line py-2 ${expanded ? "px-3" : "px-2"}`}>
        <div className={`flex items-center gap-1 ${expanded ? "" : "flex-col"}`}>
          <NavLink
            to="/account"
            title={expanded ? undefined : `${user?.full_name || user?.username} — My account`}
            className={({ isActive }) =>
              `flex min-h-10 min-w-0 items-center gap-2.5 rounded-sm transition-colors ${expanded ? "flex-1 px-1.5" : "justify-center p-1"} ${
                isActive ? "bg-frame-3" : "hover:bg-frame-2"
              }`
            }
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-frame-3 text-2xs font-semibold text-frame-fg">{initials}</span>
            {expanded ? (
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-dense font-medium text-frame-fg">{user?.full_name || user?.username}</span>
                <span className="block text-xs text-frame-fg-2">{user ? ROLE_LABEL[user.role] : ""}</span>
              </span>
            ) : null}
          </NavLink>
          <button type="button" onClick={logout} className="btn btn-ghost btn-sm btn-icon text-frame-fg-2" aria-label="Log out" title="Log out">
            <Icon name="logout" className="h-4 w-4" />
          </button>
        </div>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            className={`mt-1 flex h-8 w-full items-center gap-2 rounded-sm text-xs text-frame-fg-2 transition-colors hover:bg-frame-2 hover:text-frame-fg ${expanded ? "px-2.5" : "justify-center"}`}
            aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
            title={expanded ? "Collapse navigation" : "Expand navigation"}
          >
            <Icon name="sidebar" className="h-4 w-4" />
            {expanded ? "Collapse" : null}
          </button>
        ) : null}
      </div>
    </aside>
  );

  return (
    <div className="flex h-full overflow-hidden bg-frame">
      <div className="hidden h-full shrink-0 lg:block">{renderRail(rail.expanded, rail.toggle)}</div>

      {navOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-scrim" onClick={() => setNavOpen(false)} />
          <div className="relative h-full w-56 animate-enter shadow-overlay">{renderRail(true)}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="scope-graphite flex h-12 shrink-0 items-center gap-3 bg-frame px-3 text-dense text-frame-fg lg:pr-4 lg:pl-1">
          <button type="button" className="btn btn-ghost btn-sm btn-icon lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          {current ? (
            <p className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
              <span className="hidden text-frame-fg-2 xl:inline">{current.group}</span>
              <Icon name="chevronRight" className="hidden h-3.5 w-3.5 text-frame-fg-2/60 xl:block" />
              <span className="font-semibold">{current.label}</span>
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="mx-auto hidden h-8 w-full max-w-sm items-center gap-2 rounded-sm border border-frame-line bg-frame-2 px-2.5 text-frame-fg-2 transition-colors hover:border-frame-3 hover:text-frame-fg md:flex"
          >
            <Icon name="search" className="h-4 w-4" />
            <span className="flex-1 truncate text-left">Go to a page or find a product</span>
            <span className="kbd">Ctrl K</span>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-4 md:ml-0">
            <button type="button" onClick={() => setPaletteOpen(true)} className="btn btn-ghost btn-sm btn-icon md:hidden" aria-label="Search">
              <Icon name="search" className="h-4 w-4" />
            </button>
            {backupWarning ? (
              <Link to="/backup" className="hidden items-center gap-2 text-caution hover:text-frame-fg xl:flex" title={backupWarning}>
                <span className="signal signal-caution" aria-hidden />
                Backup needs attention
              </Link>
            ) : null}
            {drawer === null ? (
              <Link to="/cash" className="flex items-center gap-2 text-caution hover:text-frame-fg">
                <span className="signal signal-caution" aria-hidden />
                Drawer closed
              </Link>
            ) : drawer ? (
              <Link to="/cash" className="hidden items-center gap-2 hover:text-frame-fg sm:flex" title={`Opened by ${drawer.opened_by_name ?? "—"}`}>
                <span className="signal" aria-hidden />
                <span>
                  Drawer open <span className="text-frame-fg-2">{timeOf(drawer.opened_at)}</span>
                </span>
              </Link>
            ) : null}
            {settings ? (
              <span className="hidden font-mono text-xs text-frame-fg-2 lg:inline" title="Exchange rate used for LBP">
                1 USD = {settings.exchange_rate.toLocaleString()} LBP
              </span>
            ) : null}
            <ThemeSwitch />
          </div>
        </header>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-xl border-t border-l border-frame-line bg-canvas px-4 pt-4 pb-4 text-fg lg:px-6 lg:pt-5 max-lg:rounded-none max-lg:border-l-0">
          <Outlet />
        </main>
      </div>

      <CommandPalette items={paletteItems} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toaster />
    </div>
  );
}
