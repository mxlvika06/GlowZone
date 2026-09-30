// ============================================================================
// FOCUS ENGINE — a singleton, independent of the router.
// ----------------------------------------------------------------------------
// The timer's *state* lives here (not inside focusTimer.js's render closure)
// so that if the user navigates to another page and back, the running
// session is still there, still counting real elapsed time (based on
// timestamps, not on a ticking interval that could be paused by the tab
// being backgrounded or the route changing).
//
// The running session is also mirrored to localStorage (its own small key,
// separate from the main data blob) so it survives a page reload or the
// phone discarding the tab. Only *finished* sessions are written to the main
// store (see focusTimer.js).
// ============================================================================

import { todayStr } from './utils.js';

const SESSION_KEY = 'glowup:focus-session:v1';

let session = null;
const listeners = new Set();

/**
 * session shape:
 * {
 *   subjectId, task, presetLabel,
 *   plannedSeconds,
 *   accumulatedSeconds,   // seconds counted before the current running segment
 *   segmentStart,         // Date.now() when the current running segment began (null if paused)
 *   paused,
 *   date,                 // date the session was started on (for logging)
 * }
 */

function persist() {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) { /* storage unavailable: timer still works in memory */ }
}

function restore() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    const valid = s && Number.isFinite(s.plannedSeconds) && s.plannedSeconds > 0
      && Number.isFinite(s.accumulatedSeconds) && typeof s.date === 'string'
      && (s.paused || Number.isFinite(s.segmentStart));
    if (!valid) { localStorage.removeItem(SESSION_KEY); return; }
    session = {
      subjectId: s.subjectId || '', task: s.task || '', presetLabel: s.presetLabel || 'Custom',
      plannedSeconds: s.plannedSeconds, accumulatedSeconds: s.accumulatedSeconds,
      segmentStart: s.paused ? null : s.segmentStart, paused: !!s.paused, date: s.date,
    };
    // If the app was closed for so long that the planned time has already
    // passed, don't credit hours of "away" time: stop the clock at the
    // planned length and let the person end/log it.
    if (!session.paused) {
      const total = session.accumulatedSeconds + (Date.now() - session.segmentStart) / 1000;
      if (total > session.plannedSeconds) {
        session.accumulatedSeconds = session.plannedSeconds;
        session.segmentStart = null;
        session.paused = true;
        persist();
      }
    }
  } catch (e) {
    try { localStorage.removeItem(SESSION_KEY); } catch (e2) { /* ignore */ }
  }
}
restore();

export function getSession() {
  return session;
}

export function isRunning() {
  return !!session;
}

export function startSession({ subjectId, task, presetLabel, plannedMinutes }) {
  session = {
    subjectId: subjectId || '',
    task: task || '',
    presetLabel: presetLabel || 'Custom',
    plannedSeconds: Math.max(1, Math.round(plannedMinutes * 60)),
    accumulatedSeconds: 0,
    segmentStart: Date.now(),
    paused: false,
    date: todayStr(),
  };
  persist();
  notify();
}

export function pauseSession() {
  if (!session || session.paused) return;
  session.accumulatedSeconds += (Date.now() - session.segmentStart) / 1000;
  session.segmentStart = null;
  session.paused = true;
  persist();
  notify();
}

export function resumeSession() {
  if (!session || !session.paused) return;
  session.segmentStart = Date.now();
  session.paused = false;
  persist();
  notify();
}

export function getElapsedSeconds() {
  if (!session) return 0;
  if (session.paused) return session.accumulatedSeconds;
  return session.accumulatedSeconds + (Date.now() - session.segmentStart) / 1000;
}

/** Ends the session and returns a snapshot (elapsedSeconds included) for the caller to log. Clears the singleton. */
export function endSession() {
  if (!session) return null;
  const elapsedSeconds = getElapsedSeconds();
  const snapshot = { ...session, elapsedSeconds };
  session = null;
  persist();
  notify();
  return snapshot;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => {
    try { fn(session); } catch (e) { console.error(e); }
  });
}
