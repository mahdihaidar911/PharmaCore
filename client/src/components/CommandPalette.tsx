import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./icons";

export type PaletteItem = { to: string; label: string; group: string; icon: IconName };

/** "Go to" palette (Ctrl K): jump to any page the user's role can open. */
export function CommandPalette({ items, open, onClose }: { items: PaletteItem[]; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    const returnTo = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      if (returnTo && document.contains(returnTo)) returnTo.focus();
    };
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  if (!open) return null;

  const go = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to page"
        className="w-full max-w-md overflow-hidden rounded-md border border-rule-strong bg-paper-0 shadow-overlay"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-rule px-3">
          <Icon name="search" className="h-4 w-4 text-ink-3" />
          <input
            ref={inputRef}
            className="min-h-11 w-full bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
            placeholder="Go to page…"
            value={query}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={matches[index] ? `palette-${matches[index].to}` : undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(matches[index]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-80 overflow-auto py-1">
          {matches.map((item, i) => (
            <li
              key={item.to}
              id={`palette-${item.to}`}
              role="option"
              aria-selected={i === index}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${i === index ? "bg-lime-200 text-ink" : "text-ink-2"}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => go(item)}
            >
              <Icon name={item.icon} className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              <span className="meta">{item.group}</span>
            </li>
          ))}
          {matches.length === 0 ? <li className="px-3 py-3 text-sm text-ink-3">No page matches “{query}”.</li> : null}
        </ul>
      </div>
    </div>
  );
}
