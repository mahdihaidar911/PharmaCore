/** Whole days from today (local) until an ISO date (YYYY-MM-DD); negative when already past. */
export function daysUntil(isoDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${isoDate.slice(0, 10)}T00:00:00`).getTime() - today.getTime()) / 86_400_000);
}

/**
 * How an expiry reads everywhere in the app. Expired is the only "danger" state (it cannot be sold);
 * within 90 days is "caution"; otherwise the remaining time is shown quietly.
 */
export function expiryStatus(days: number): { tone: "danger" | "caution" | "muted"; label: string } {
  if (days < 0) return { tone: "danger", label: `Expired ${-days} d ago` };
  if (days === 0) return { tone: "caution", label: "Last day to sell" };
  if (days <= 90) return { tone: "caution", label: `${days} days left` };
  if (days < 365) return { tone: "muted", label: `${Math.round(days / 30.4)} months` };
  return { tone: "muted", label: `${(days / 365).toFixed(1)} years` };
}
