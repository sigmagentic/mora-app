/**
 * Shared game epoch / time logic. Used by get-active-question API and PrivateDataGame.
 * - Month: UTC 0–11 → game slot 1–12
 * - Hour:  UTC 0–23 → game slot 1–24 (slot 1 = 00:00–00:59 UTC)
 */

/** UTC month 0–11 → game slot 1–12 */
export function getGameMonthSlot(now: Date): number {
  return now.getUTCMonth() + 1;
}

/** UTC hour 0–23 → game slot 1–24 (slot 1 = 00:00–00:59 UTC) */
export function getGameHourSlot(now: Date): number {
  return now.getUTCHours() + 1;
}

/** Epoch id HHDDMMYY for DB. Uses game slots 1–24 and 1–12. */
export function getEpochId(now: Date): string {
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const mm = String(getGameMonthSlot(now)).padStart(2, "0");
  const yy = String(now.getUTCFullYear()).slice(-2);
  const hh = String(getGameHourSlot(now)).padStart(2, "0");
  return `${hh}${dd}${mm}${yy}`;
}

/** Date string dd-mm-yy for localStorage etc. Uses game month 1–12. */
export function getCurrentDateDDMMYY(now: Date): string {
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const mm = String(getGameMonthSlot(now)).padStart(2, "0");
  const yy = String(now.getUTCFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

/**
 * Start of current UTC hour (for opens_at). Uses real UTC components (0–11 month, 0–23 hour).
 * Game slots 1–24 are for epoch_id/display only; timestamps use actual UTC.
 */
export function getOpensAt(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      0,
      0,
      0
    )
  );
}

/** End of current UTC hour (for closes_at). */
export function getClosesAt(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      59,
      59,
      999
    )
  );
}

/** Format for DB timestamp column: "YYYY-MM-DD HH:mm:ss.sss" (no TZ). */
export function toTimestampStr(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}
