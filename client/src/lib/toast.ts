export type ToastTone = "success" | "info" | "error";
export type ToastMessage = { id: number; tone: ToastTone; text: string };

const TOAST_EVENT = "pharmacore:toast";
let nextId = 1;

/** Confirms a completed action without moving focus. Errors that need a decision belong inline, not here. */
export function toast(text: string, tone: ToastTone = "success") {
  window.dispatchEvent(new CustomEvent<ToastMessage>(TOAST_EVENT, { detail: { id: nextId++, tone, text } }));
}

export function onToast(listener: (message: ToastMessage) => void) {
  const handler = (e: Event) => listener((e as CustomEvent<ToastMessage>).detail);
  window.addEventListener(TOAST_EVENT, handler);
  return () => window.removeEventListener(TOAST_EVENT, handler);
}
