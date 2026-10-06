import { z } from "zod";

/**
 * Timestamps are stored by SQLite as UTC (`datetime('now')`). The server runs on the pharmacy PC,
 * so reports group by the machine's local calendar day using SQLite's 'localtime' modifier.
 */
export const LOCAL_DAY_SQL = (column: string) => `date(${column}, 'localtime')`;

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Invalid calendar date");

export function localDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysInclusive(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export const MAX_REPORT_RANGE_DAYS = 400;

export type DateRange = { from: string; to: string };

/** Fills defaults (last 30 days) and validates order and maximum span. */
export function resolveRange(from?: string, to?: string): DateRange {
  const end = to ?? localDateString();
  const start = from ?? addDays(end, -29);
  if (start > end) {
    throw new RangeError(`Start date ${start} is after end date ${end}`);
  }
  if (daysInclusive(start, end) > MAX_REPORT_RANGE_DAYS) {
    throw new RangeError(`Date range is limited to ${MAX_REPORT_RANGE_DAYS} days`);
  }
  return { from: start, to: end };
}
