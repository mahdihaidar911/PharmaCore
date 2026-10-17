import { useEffect, useState } from "react";
import { onToast, type ToastMessage } from "../lib/toast";
import { Icon } from "./icons";

const LIFETIME_MS = 4000;

export function Toaster() {
  const [items, setItems] = useState<ToastMessage[]>([]);

  useEffect(
    () =>
      onToast((message) => {
        setItems((prev) => [...prev.slice(-2), message]);
        if (message.tone !== "error") {
          setTimeout(() => setItems((prev) => prev.filter((m) => m.id !== message.id)), LIFETIME_MS);
        }
      }),
    [],
  );

  const dismiss = (id: number) => setItems((prev) => prev.filter((m) => m.id !== id));

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite" role="status">
      {items.map((m) => (
        <div
          key={m.id}
          className="scope-graphite pointer-events-auto flex animate-enter items-start gap-2.5 rounded-md border border-frame-line bg-frame px-3.5 py-3 text-dense text-frame-fg shadow-overlay"
        >
          <Icon
            name={m.tone === "error" ? "alert" : m.tone === "info" ? "info" : "check"}
            className={`mt-px h-4 w-4 ${m.tone === "error" ? "text-danger" : m.tone === "info" ? "text-frame-fg-2" : "text-signal"}`}
          />
          <p className="min-w-0 flex-1">{m.text}</p>
          <button type="button" onClick={() => dismiss(m.id)} className="-m-1 rounded-xs p-1 text-frame-fg-2 hover:text-frame-fg" aria-label="Dismiss">
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
