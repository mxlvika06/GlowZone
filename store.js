// ============================================================================
// STORE — the only place that talks to localStorage.
// ----------------------------------------------------------------------------
// Every section imports the same Store instance from app.js and calls
// store.get() / store.update(fn) / store.subscribe(fn). This keeps the data
// layer swappable later (e.g. IndexedDB for photos, or a backend sync layer)
// without touching section code, since they only ever see this interface.
//
// Data-safety rules (audit pass):
//  - The storage key is unchanged ('glowup:data:v1'), so existing data loads.
//  - Anything loaded/imported is merged over defaultState() AND type-checked
//    against it, so a malformed/partial file can't put e.g. a string where an
//    array is expected and crash a page.
//  - Before an import or reset replaces data, the previous data is copied to
//    a backup key so a mistake is recoverable.
//  - If another tab changes the data, this tab reloads it instead of later
//    overwriting it with a stale copy.
// ============================================================================

const STORAGE_KEY = 'glowup:data:v1';
const BACKUP_KEY = STORAGE_KEY + ':pre-replace-backup';
const CORRUPT_KEY = STORAGE_KEY + ':corrupted-backup';

const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

/**
 * Merge `saved` over `def`, keeping only values whose type matches the
 * default's type. Unknown keys inside object-typed defaults that are used as
 * dictionaries (logs, skincareLog, ...) are preserved as-is.
 */
function deepMergeDefaults(def, saved) {
  if (Array.isArray(def)) return Array.isArray(saved) ? saved : def;
  if (def && typeof def === 'object') {
    const out = { ...def };
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const key of Object.keys(saved)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        out[key] = key in def ? deepMergeDefaults(def[key], saved[key]) : saved[key];
      }
    }
    return out;
  }
  // primitive default: only accept a saved value of the same type
  return saved !== undefined && typeOf(saved) === typeOf(def) ? saved : def;
}

/** Drop obviously broken records so one bad entry can't crash a whole page. */
function sanitize(state) {
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const keepObjects = (arr) => (Array.isArray(arr) ? arr.filter(isObj) : []);

  state.habits = keepObjects(state.habits).filter((h) => typeof h.id === 'string' && typeof h.label === 'string');
  state.workouts = keepObjects(state.workouts).map((w) => ({ ...w, name: String(w.name ?? ''), exercises: keepObjects(w.exercises) }));
  state.subjects = keepObjects(state.subjects).map((s) => ({
    ...s, name: String(s.name ?? ''), topics: Array.isArray(s.topics) ? s.topics.map(String) : [],
    studyLog: isObj(s.studyLog) ? s.studyLog : {},
  }));
  state.tasks = keepObjects(state.tasks).filter((t) => typeof t.dueDate === 'string');
  state.badmintonSessions = keepObjects(state.badmintonSessions).filter((s) => typeof s.date === 'string');
  state.studyCheckins = keepObjects(state.studyCheckins).filter((c) => typeof c.date === 'string');
  state.focusSessions = keepObjects(state.focusSessions).filter((s) => typeof s.date === 'string');
  state.timerPresets = keepObjects(state.timerPresets).filter((p) => +p.focusMin > 0);

  for (const key of ['skincareLog']) {
    for (const [d, v] of Object.entries(state[key])) {
      state[key][d] = {
        morning: Array.isArray(v?.morning) ? v.morning : [],
        night: Array.isArray(v?.night) ? v.night : [],
        note: typeof v?.note === 'string' ? v.note : '',
      };
    }
  }
  for (const [d, v] of Object.entries(state.haircareLog)) {
    state.haircareLog[d] = { steps: Array.isArray(v?.steps) ? v.steps : [], note: typeof v?.note === 'string' ? v.note : '' };
  }
  for (const [d, v] of Object.entries(state.socialLog)) {
    state.socialLog[d] = {
      completed: Array.isArray(v?.completed) ? v.completed : [],
      wentWell: typeof v?.wentWell === 'string' ? v.wentWell : '',
      awkward: typeof v?.awkward === 'string' ? v.awkward : '',
      tomorrow: typeof v?.tomorrow === 'string' ? v.tomorrow : '',
    };
  }
  for (const [d, v] of Object.entries(state.workoutLog)) state.workoutLog[d] = Array.isArray(v) ? v : [];
  for (const [d, v] of Object.entries(state.logs)) if (!isObj(v)) state.logs[d] = {};

  const goal = +state.settings.studyGoalMinutes;
  state.settings.studyGoalMinutes = goal > 0 ? goal : 180;
  if (!['light', 'dark', 'system'].includes(state.settings.theme)) state.settings.theme = 'system';
  return state;
}

/** Keys that must exist (with the right type) for a file to count as a Glow-Up OS backup. */
const BACKUP_MARKER_KEYS = ['habits', 'logs', 'settings', 'meta', 'subjects', 'workouts', 'skincareLog', 'socialLog'];

export class Store {
  constructor(defaultStateFactory) {
    this._defaultStateFactory = defaultStateFactory;
    this._listeners = new Set();
    this.saveFailed = false;
    this.state = this._load();

    // Another tab/window changed the data: adopt it rather than overwrite it later.
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY) return;
        this.state = this._load();
        this._notify();
        this.onExternalChange?.();
      });
    }
  }

  _load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return sanitize(this._defaultStateFactory());
      const parsed = JSON.parse(raw);
      return sanitize(deepMergeDefaults(this._defaultStateFactory(), parsed));
    } catch (e) {
      console.error('[glowup] failed to load saved data, starting fresh', e);
      // Keep an untouched copy so a corrupted write is recoverable instead of
      // being overwritten by the very next store.update() call.
      try { if (raw) localStorage.setItem(CORRUPT_KEY, raw); } catch (e2) { /* best effort */ }
      return sanitize(this._defaultStateFactory());
    }
  }

  get() { return this.state; }

  /** Mutate the state in place inside fn, then persist + notify. */
  update(fn) {
    fn(this.state);
    this._persist();
    this._notify();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    this._listeners.forEach((fn) => {
      try { fn(this.state); } catch (e) { console.error(e); }
    });
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.saveFailed = false;
    } catch (e) {
      console.error('[glowup] failed to save data (storage full or blocked)', e);
      if (!this.saveFailed) this.onSaveError?.(e); // warn once, not on every tap
      this.saveFailed = true;
    }
  }

  exportJSON() {
    return JSON.stringify(this.state, null, 2);
  }

  /** Copy whatever is currently stored to the backup key (best effort). */
  _backupCurrent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.setItem(BACKUP_KEY, raw);
    } catch (e) { console.warn('[glowup] could not write pre-replace backup', e); }
  }

  hasBackup() {
    try { return !!localStorage.getItem(BACKUP_KEY); } catch (e) { return false; }
  }

  /** Restore the copy made just before the last import/reset. */
  restoreBackup() {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) throw new Error('No backup available.');
    this.state = sanitize(deepMergeDefaults(this._defaultStateFactory(), JSON.parse(raw)));
    this._persist();
    this._notify();
  }

  /** Throws a readable Error if the text isn't a usable Glow-Up OS backup. Never mutates state. */
  validateImport(json) {
    let parsed;
    try { parsed = JSON.parse(json); } catch (e) { throw new Error('That file is not valid JSON.'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('That file is not a Glow-Up OS backup (expected a JSON object).');
    }
    if (!BACKUP_MARKER_KEYS.some((k) => k in parsed)) {
      throw new Error('That file doesn\'t look like a Glow-Up OS backup (none of the expected data was found).');
    }
    return sanitize(deepMergeDefaults(this._defaultStateFactory(), parsed));
  }

  importJSON(json) {
    const next = this.validateImport(json); // throws before anything is touched
    this._backupCurrent();
    this.state = next;
    this._persist();
    this._notify();
  }

  reset() {
    this._backupCurrent();
    this.state = sanitize(this._defaultStateFactory());
    this._persist();
    this._notify();
  }
}
