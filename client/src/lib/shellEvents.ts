/** Tells the app shell to re-read state it shows in the running header (cash drawer). */
export const DRAWER_CHANGED = "pharmacore:drawer-changed";

export function notifyDrawerChanged() {
  window.dispatchEvent(new Event(DRAWER_CHANGED));
}
