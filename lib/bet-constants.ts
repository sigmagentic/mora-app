/**
 * Stop accepting bets this many minutes before closes_at to avoid race conditions.
 */
export const BETTING_CUTOFF_MINUTES = 15;

/**
 * Parse a DB timestamp (stored as UTC, no TZ suffix) as UTC.
 * Handles "2026-02-07T23:59:59.999" and "2026-02-07 23:59:59.999".
 */
export function parseUtcTimestamp(str: string | null | undefined): Date | null {
  if (str == null || typeof str !== "string") return null;
  const s = str.trim();
  if (!s) return null;
  // Already has timezone — parse as-is
  if (s.endsWith("Z") || /[+-]\d{2}(:?\d{2})?$/.test(s)) {
    return new Date(s);
  }
  // Parse components and build UTC date explicitly (avoids local TZ interpretation)
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/
  );
  if (m) {
    const ms = m[7] ? parseInt(m[7].padEnd(3, "0").slice(0, 3), 10) : 0;
    return new Date(
      Date.UTC(
        parseInt(m[1], 10),
        parseInt(m[2], 10) - 1,
        parseInt(m[3], 10),
        parseInt(m[4], 10),
        parseInt(m[5], 10),
        parseInt(m[6], 10),
        ms
      )
    );
  }
  return new Date(s + "Z");
}
