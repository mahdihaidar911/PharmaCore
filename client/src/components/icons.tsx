/**
 * The one icon family: 24px grid, 1.6px round stroke, no fills. Sizes 16/18/20 only.
 * Icons label navigation and actions; they are never decoration.
 */
const PATHS = {
  dashboard: "M4 5h7v6H4zM13 5h7v3h-7zM13 10h7v9h-7zM4 13h7v6H4z",
  pos: "M4 4h16v11H4zM8 19h8M12 15v4M8 8h5M8 11h8",
  sales: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h4",
  returns: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  products: "M20 7.5 12 3 4 7.5v9L12 21l8-4.5zM4 7.5l8 4.5 8-4.5M12 12v9",
  receive: "M12 3v11M7.5 9.5 12 14l4.5-4.5M4 17v3h16v-3",
  inventory: "M4 4h16v4H4zM5 8v12h14V8M10 12h4",
  reports: "M5 20V11M10.5 20V5M16 20v-6M21 20H3",
  assistant: "M12 4v3M12 17v3M4 12h3M17 12h3M7 7l1.5 1.5M15.5 15.5 17 17M17 7l-1.5 1.5M8.5 15.5 7 17M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5",
  users: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15 4.15a3.5 3.5 0 0 1 0 6.7",
  moph: "M4 4h16v16H4zM4 9h16M9 9v11",
  backup: "M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  profile: "M4 20V8l8-4 8 4v12M9.5 20v-5h5v5M12 8v4M10 10h4",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4",
  menu: "M4 7h16M4 12h16M4 17h16",
  cash: "M3 6h18v12H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M6.5 9.5v.01M17.5 14.5v.01",
  pause: "M9 5v14M15 5v14",
  logout: "M10 20H5V4h5M15.5 16.5 20 12l-4.5-4.5M20 12H9",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M20 20l-4.8-4.8",
  close: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "M5 12.5 9.5 17 19 7",
  alert: "M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.01",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5.5M12 7.8v.01",
  chevronDown: "M6 9.5l6 6 6-6",
  chevronRight: "M9.5 6l6 6-6 6",
  arrowRight: "M5 12h14M13.5 6.5 19 12l-5.5 5.5",
  printer: "M7 9V4h10v5M7 17H4v-8h16v8h-3M7 14h10v6H7z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7.5V12l3 2",
  barcode: "M4 5v14M7.5 5v14M10 5v14M13.5 5v14M16 5v14M20 5v14",
  refresh: "M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4",
  download: "M12 4v11M7.5 10.5 12 15l4.5-4.5M4 19h16",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "h-[18px] w-[18px]", title }: { name: IconName; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}
