// Small, dependency-free helpers used across the app.

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function todayStr(d = new Date()) {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

export function last7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(addDays(todayStr(), -i));
  return days;
}

/** 'YYYY-MM' for a date string — used to group/filter by calendar month. */
export function monthPrefix(dateStr = todayStr()) {
  return dateStr.slice(0, 7);
}

/** How many days of the current month have elapsed (1 = the 1st itself). */
export function dayOfMonth(dateStr = todayStr()) {
  return new Date(dateStr + 'T00:00:00').getDate();
}

export function formatDateHuman(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** e.g. "Mon, 28 Sep" — used in history lists instead of raw 2026-09-28. */
export function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function weekdayNarrow(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'narrow' });
}

/** Parse a user-typed number; returns fallback for blank/NaN/negative. */
export function toPositiveInt(value, fallback = 0) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function pct(part, whole) {
  if (!whole || whole <= 0) return 0;
  return clamp(Math.round((part / whole) * 100), 0, 100);
}

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function minutesToLabel(mins) {
  mins = Math.round(mins || 0);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
