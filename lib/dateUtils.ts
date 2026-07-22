// Shared date formatting helpers used across the app.
// All user-visible date inputs use MM/DD/YYYY; DB stores YYYY-MM-DD.

/** Auto-formats digits into MM/DD/YYYY as the user types.
 *  Pass `prev` (the previous value) to allow free deletion without re-formatting. */
export function autoFormatDate(raw: string, prev?: string): string {
  if (prev !== undefined && raw.length < prev.length) return raw;
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Parses MM/DD/YYYY or YYYY-MM-DD → YYYY-MM-DD. Returns null if invalid. */
export function parseDisplayDate(input: string): string | null {
  const s = input.trim();
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const d = new Date(+m1[3], +m1[1] - 1, +m1[2]);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/** Converts a YYYY-MM-DD string to MM/DD/YYYY for display. */
export function toDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

/** Today's date as MM/DD/YYYY. */
export function todayDisplay(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/** Today's date as YYYY-MM-DD. */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}
