/** Calendar day key in the server's local timezone (YYYY-MM-DD). */
export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Normalize API date payloads to a YYYY-MM-DD text key.
 * Zod coerce.date() turns "2026-07-23" into a Date; drizzle text columns
 * then get a full ISO string and miss the unique row — mood/energy "revert".
 */
export function toDateKey(value: string | Date): string {
  if (typeof value === "string") {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1]!;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return localDateKey();
}
