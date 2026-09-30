# Glow-Up OS

Your personal operating system for a 2026 → 2027 glow-up. Local-first, no
backend, no build step, no account. Everything lives in your browser.

## Audit & polish pass (latest)

No features were added or removed; existing data is untouched. What changed:
- **Layout:** three-stat rows (Focus, Study → Progress, Fitness) now stay on one
  row on phones instead of wrapping and leaving an orphaned card.
- **Accessibility:** form-field outlines now meet 3:1 contrast in light and
  dark themes (new `--border-strong` token); small buttons, ✕ buttons and chips
  are at least 40px on touch screens; all text/background pairs verified ≥ 4.5:1.
- **Badminton sessions can now be edited** (previously delete-and-re-log only);
  the day's "Badminton practice" habit stays in sync when a session is
  added, edited, moved to another day, or deleted.
- **History lists** show friendly dates ("Mon, 28 Sep") instead of ISO strings.
- **Code quality:** `autosave()` no longer accumulates stale handlers across
  page re-renders; the duplicated badminton habit-sync logic is one helper;
  expected import rejections log as warnings, not errors; stale comments fixed.
- **PWA:** service-worker cache bumped to `glowup-cache-v5` so installed copies
  refresh cleanly.

Verified working (unchanged): offline loading, installable manifest + icons,
data survives reload/navigation, export/import/reset (reset needs two
confirmations; a restore copy is kept after import/reset), invalid imports are
rejected without touching your data, the focus timer survives navigation and
reload, and the app re-renders correctly if left open past midnight.

## Study progress update (on top of Phase 2)

Added a fast daily study check-in and richer Study/Dashboard progress views:
- `+ Log Study` quick-entry modal (Study page + Dashboard) — duration chips,
  optional subject/topic/tasks-completed/notes, ~30–60s to fill in. Remembers
  your last subject/duration for even faster repeat entries.
- Editable daily study goal (`Study page → Edit goal`), used for the
  Today progress bar everywhere it's shown.
- Today / This week / This month totals, sessions count, subject-wise time,
  and non-judgmental consistency stats (days studied, not "productivity
  scores").
- "Topics covered today" and "Tasks completed today" derived from check-ins.
- Data model: new `settings.studyGoalMinutes` and `studyCheckins[]` fields
  (see `js/schema.js`). Both are additive — existing saved data upgrades
  automatically via `store.js`'s merge-defaults logic, nothing is migrated
  or lost. Focus Timer sessions and quick check-ins are combined for all
  stats (see `computeStudyStats()` in `js/sections/study.js`) without any
  double-counting.

## Running it locally

Because the app uses ES modules (`<script type="module">`), most browsers
block it from `file://` for security reasons — you need a tiny local
server (no install/build required, just serves static files):

**Option A — Python (already on most machines):**
```bash
cd glowup-app
python3 -m http.server 8080
```
Then open http://localhost:8080 in your browser.

**Option B — Node (if you have it):**
```bash
cd glowup-app
npx serve .
```

**Option C — VS Code:** install the "Live Server" extension, right-click
`index.html` → "Open with Live Server".

That's it — no `npm install`, no build step, no compilation.

## Putting it on your phone

1. Host the `glowup-app` folder somewhere reachable from your phone's
   browser — e.g. free static hosting like GitHub Pages, Netlify, Vercel,
   Cloudflare Pages (drag-and-drop the folder), or run the local server on
   your computer and visit `http://<your-computer-ip>:8080` from your
   phone on the same Wi-Fi.
2. Open the site in Safari (iOS) or Chrome (Android).
3. iOS: tap Share → "Add to Home Screen". Android: tap the menu (⋮) →
   "Add to Home screen" / "Install app".
4. It now behaves like an installed app (own icon, full-screen, works
   offline after first load) thanks to the included service worker
   (`sw.js`) and `manifest.json`.

This is a real installable PWA — no app-store submission needed for
personal use. Packaging it into an actual App Store / Play Store binary
later (e.g. via Capacitor) is possible without rewriting the app, since
the UI is plain HTML/CSS/JS.

## Data & privacy

All your data is stored in **your browser's localStorage only** —
nothing is sent anywhere. That means:
- Data is per-browser. Using it in Chrome and Safari gives two separate
  data sets. Use Export/Import (Settings) to move data between them.
- Clearing your browser's site data will erase it — export a backup
  periodically (Settings → Data → Export).
- Nothing here requires an internet connection after the first load.

## Project structure

```
glowup-app/
  index.html          — app shell (nav, containers)
  manifest.json        — PWA metadata (installability)
  sw.js                 — offline caching service worker
  css/styles.css        — all styling, theme variables (light/dark)
  icons/icon.svg         — app icon
  js/
    app.js               — entry point: wires store, nav, routes, theme
    store.js              — localStorage persistence layer (swap-out point for a future backend)
    schema.js              — CENTRAL DATA MODEL — default habits/categories/routines live here
    habits.js               — shared helpers for reading/writing daily habit logs
    router.js                — tiny hash-based router (#/fitness, #/study, ...)
    components.js             — reusable UI builders (cards, progress rings, toasts, modals)
    theme.js                   — light/dark theme application
    focusEngine.js              — singleton focus-session timer state (survives page navigation)
    sections/
      dashboard.js              — home screen
      fitness.js, badminton.js, skincare.js, haircare.js,
      posture.js, social.js
      study.js                   — subjects, study-time logging, deadlines/tasks timeline
      focusTimer.js               — focus timer: presets, live countdown, session history
      settings.js                 — theme, habits, timer presets, data export/import/reset
```

## How to modify things later

- **Add/rename/remove a habit, routine step, skill, or challenge:**
  no code changes needed — use Settings (habits) or the inline
  "add/remove" controls on each section page (skincare steps, haircare
  steps, badminton skills, social challenges).
- **Change default habits for a brand-new install:** edit
  `js/schema.js` → `defaultState()`. This does NOT affect your already-
  saved data (see `store.js` merge logic) — only fresh installs.
- **Add a whole new section:** create `js/sections/yourthing.js`
  exporting a `renderYourThing(root, store)` function, then register it
  in `js/app.js` (add to `NAV_ITEMS` and `registerRoute`).
- **Change colors/fonts/spacing:** all in `css/styles.css`, using CSS
  variables at the top (`:root` and `[data-theme="dark"]`).

## What's built in Phase 1

- Central, editable data model (habits, categories, routines) — nothing
  hardcoded into the UI.
- Persistent local storage with export / import / reset.
- Home dashboard: daily completion %, streak, weekly bar chart,
  per-category status, quick actions, non-guilt-inducing messaging.
- Fitness: custom workout builder (name/exercises/sets/reps/notes),
  daily log, streak, weekly activity, total workouts.
- Badminton: session logging (duration/type/skills/notes), editable
  skill list, weekly practice time.
- Skincare: fully customizable morning/night step checklists, daily
  note.
- Hair care: customizable routine steps, daily note, recent wash-day
  history.
- Posture/physical habits: fully custom checklist.
- Social confidence: customizable challenge list + daily reflection
  (what went well / what felt awkward / tomorrow), no shaming for quiet
  days.
- Study: subjects with progress %, topics, and time logging; daily/
  weekly totals.
- Settings: theme (light/dark/system), full habit management
  (add/edit/deactivate/delete), data export/import/reset.
- Responsive layout: sidebar nav on desktop, bottom tab bar on mobile.
- Installable as a PWA (offline-capable via service worker).

## What Phase 2 added

- **Study planner:** deadlines/assignments/exams as tasks (title, type,
  optional subject, due date, notes), shown as a soonest-first timeline
  on the Study page with overdue/due-soon highlighting, plus each
  subject now shows its own upcoming tasks inline.
- **Focus Timer** (`#/focus`): pick a preset (25/5, 50/10, 90-min deep
  work, or Custom), optionally attach a subject + task, start a live
  countdown. Pause/resume, or end early (logged as "interrupted" vs
  "completed"). A session survives navigating to other pages and back —
  the countdown keeps running in the background — because its state
  lives in a small singleton (`js/focusEngine.js`) independent of
  whichever page is currently rendered. On finishing, an optional
  reflection is captured and the time is credited to the chosen
  subject's study log (and the `h_study` habit) using the exact same
  logic as manually logging time on the Study page.
- **Editable timer presets** (Settings → Timer presets): add, edit, or
  delete presets — they show up as chips on the Focus Timer page
  immediately.
- Everything from Phase 1 is unchanged in behavior; the router gained
  one small, backward-compatible addition (a page can optionally return
  a cleanup function, used only by the Focus Timer to stop its
  once-a-second UI refresh when you navigate away — existing sections
  don't need to know about this).

## Not built yet (later phases, per the original plan)

- **Phase 3:** webcam-based focus detection during study sessions
  (planned via a client-side computer-vision library — nothing is
  ever uploaded). The Focus Timer page already has placeholder "Focus
  status" / "Camera" fields ready for this to plug into.
- **Phase 4:** analytics page (day/week/month/year views across all
  categories), goals/milestones, full journal with search, achievements.
- **Phase 5:** animation polish, accessibility pass, deeper error
  handling, edge-case UX.

Ask for any of these whenever you're ready — the architecture above was
built specifically so they can be added without reworking what's here.
