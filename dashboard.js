import { CATEGORIES } from './schema.js';
import { todayStr, last7Days, weekdayNarrow, pct, formatDateHuman, minutesToLabel, escapeHtml } from './utils.js';
import { card, circularProgress, progressBar } from './components.js';
import { navigate } from './router.js';
import { activeHabits, isHabitDone, toggleBoolean } from './habits.js';
import { getSession, getElapsedSeconds } from './focusEngine.js';
import { computeStudyStats, openQuickCheckinModal, daysUntil, dueLabel } from './study.js';
import { openSessionEditor } from './badminton.js';

export function computeDailyCompletion(state, date = todayStr()) {
  const habits = activeHabits(state);
  if (habits.length === 0) return 0;
  const done = habits.filter((h) => isHabitDone(state, h, date)).length;
  return pct(done, habits.length);
}

/**
 * Consecutive days with any progress. If today has nothing yet, the streak is
 * counted back from yesterday (still alive until the day ends) so it doesn't
 * read 0 every morning before you've done anything.
 */
export function computeOverallStreak(state) {
  const d = new Date();
  if (computeDailyCompletion(state, todayStr(d)) === 0) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (streak <= 3650) { // safety valve
    if (computeDailyCompletion(state, todayStr(d)) > 0) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Hello' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name && name.trim() ? `${part}, ${name.trim()}` : part;
}

function motivationalMessage(percentToday) {
  if (percentToday === 0) return 'A fresh day. Even one small step counts.';
  if (percentToday < 40) return 'Good start — pick one more thing and go.';
  if (percentToday < 80) return 'Solid progress today — keep the momentum going.';
  if (percentToday < 100) return 'Nearly there. This is what consistency looks like.';
  return 'Everything done today. Well earned.';
}

/** The few things still worth doing today, most useful first. */
function computeFocusItems(state, date, studyStats) {
  const items = [];

  const overdueOrSoon = state.tasks
    .filter((t) => !t.completed && daysUntil(t.dueDate) <= 3)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
  if (overdueOrSoon) {
    const overdue = daysUntil(overdueOrSoon.dueDate) < 0;
    items.push({ icon: overdue ? '⚠️' : '📌', text: `${overdueOrSoon.title} — ${dueLabel(overdueOrSoon.dueDate)}`, route: '/study' });
  }

  if (studyStats.todayMinutes < studyStats.goalMinutes) {
    const left = studyStats.goalMinutes - studyStats.todayMinutes;
    items.push({ icon: '📚', text: studyStats.todayMinutes === 0 ? `Study — goal ${minutesToLabel(studyStats.goalMinutes)}` : `Study — ${minutesToLabel(left)} to go`, action: 'log-study' });
  }

  const habits = activeHabits(state);
  CATEGORIES.forEach((cat) => {
    if (cat.id === 'study') return; // handled above
    const catHabits = habits.filter((h) => h.categoryId === cat.id);
    if (!catHabits.length) return;
    const pending = catHabits.filter((h) => !isHabitDone(state, h, date));
    if (!pending.length) return;
    const text = catHabits.length === 1 ? pending[0].label : `${pending.length} of ${catHabits.length} ${cat.label.toLowerCase()} habits left`;
    items.push(cat.route ? { icon: cat.icon, text, route: cat.route } : { icon: cat.icon, text, toggleHabit: pending[0].id });
  });
  return items.slice(0, 4);
}

export function renderDashboard(root, store) {
  function draw() {
    const state = store.get();
    const date = todayStr();
    const dailyPct = computeDailyCompletion(state, date);
    const streak = computeOverallStreak(state);
    const habits = activeHabits(state);
    const doneHabits = habits.filter((h) => isHabitDone(state, h, date)).length;
    const week = last7Days().map((d) => ({ date: d, pct: computeDailyCompletion(state, d) }));
    const studyStats = computeStudyStats(state, date);
    const studyPct = pct(studyStats.todayMinutes, studyStats.goalMinutes || 1);
    const focusItems = computeFocusItems(state, date, studyStats);
    const running = getSession();

    const fitnessHabit = state.habits.find((h) => h.id === 'h_fitness') || state.habits.find((h) => h.categoryId === 'fitness');
    const workoutDone = fitnessHabit ? isHabitDone(state, fitnessHabit, date) : false;

    const categoryRows = CATEGORIES.map((cat) => {
      const catHabits = habits.filter((h) => h.categoryId === cat.id);
      if (catHabits.length === 0) return '';
      const done = catHabits.filter((h) => isHabitDone(state, h, date)).length;
      const p = pct(done, catHabits.length);
      const complete = p === 100;
      const statusText = complete ? '✓' : catHabits.length === 1 ? '—' : `${done}/${catHabits.length}`;
      const statusLabel = complete ? 'done' : catHabits.length === 1 ? 'not done yet' : `${done} of ${catHabits.length} done`;
      const inner = `<span class="cat-icon" aria-hidden="true">${cat.icon}</span><span class="cat-label">${cat.label}</span><span class="cat-status ${complete ? 'cat-done' : ''}" aria-label="${statusLabel}">${statusText}</span>`;
      if (cat.route) return `<button type="button" class="cat-row" data-nav="${cat.route}">${inner}</button>`;
      // categories without a dedicated page (e.g. mindset) get an inline toggle
      return `<button type="button" class="cat-row" data-toggle-habit="${catHabits[0].id}" aria-pressed="${complete}">${inner}</button>`;
    }).join('');

    root.innerHTML = `
      <div class="page">
        <header class="page-header">
          <div>
            <h1>${escapeHtml(greeting(state.settings.displayName))}</h1>
            <p class="subtitle">${formatDateHuman(date)}</p>
          </div>
        </header>

        ${running ? `
          <button type="button" class="banner" data-nav="/focus">
            <span aria-hidden="true">⏱</span>
            <span>Focus session ${running.paused ? 'paused' : 'running'} — ${minutesToLabel(Math.round(getElapsedSeconds() / 60))} in</span>
            <span class="banner-go">Open →</span>
          </button>` : ''}

        ${card(`
          <div class="dash-hero">
            ${circularProgress(dailyPct, 92)}
            <div class="dash-hero-text">
              <div class="stat-big">${doneHabits} of ${habits.length}</div>
              <div class="stat-label">habits done today</div>
              <div class="hero-streak" title="Consecutive days with any progress">🔥 ${streak}-day streak</div>
            </div>
          </div>
          <p class="hero-msg">${motivationalMessage(dailyPct)}</p>
        `)}

        <div class="quick-grid" role="group" aria-label="Quick actions">
          <button type="button" class="quick-btn quick-primary" id="qa-study"><span class="qi" aria-hidden="true">📚</span>Log study</button>
          <button type="button" class="quick-btn ${workoutDone ? 'quick-done' : ''}" id="qa-workout" ${fitnessHabit ? '' : 'data-nav="/fitness"'} aria-pressed="${workoutDone}"><span class="qi" aria-hidden="true">🏃</span>${workoutDone ? 'Workout ✓' : 'Workout done'}</button>
          <button type="button" class="quick-btn" id="qa-badminton"><span class="qi" aria-hidden="true">🏸</span>Log badminton</button>
          <button type="button" class="quick-btn" data-nav="/skincare"><span class="qi" aria-hidden="true">🧴</span>Skincare</button>
          <button type="button" class="quick-btn" data-nav="/haircare"><span class="qi" aria-hidden="true">💇</span>Hair</button>
          <button type="button" class="quick-btn" data-nav="/social"><span class="qi" aria-hidden="true">🗣️</span>Social</button>
        </div>

        ${card(`
          <h3>Up next</h3>
          ${focusItems.length ? `<div class="focus-list">${focusItems.map((it, i) => `
            <button type="button" class="focus-item" data-focus-index="${i}"><span aria-hidden="true">${it.icon}</span><span class="focus-text">${escapeHtml(it.text)}</span><span class="focus-go" aria-hidden="true">›</span></button>`).join('')}</div>`
            : '<p class="muted" style="margin:6px 0 0">You\'re all caught up. Rest is part of the plan too.</p>'}
        `)}

        ${card(`<h3>Today</h3><div class="cat-list">${categoryRows || '<p class="muted">No habits yet — add some in Settings.</p>'}</div>`)}

        ${card(`
          <div class="row-between"><h3>📚 Study today</h3><button type="button" class="btn btn-sm btn-ghost" data-nav="/study">Open</button></div>
          <div class="row-between small"><span><strong>${minutesToLabel(studyStats.todayMinutes)}</strong> of ${minutesToLabel(studyStats.goalMinutes)}</span><span class="muted">${studyPct}%</span></div>
          <div style="margin:6px 0 10px">${progressBar(studyPct, 'Study goal progress')}</div>
          <div class="row-between small muted">
            <span>Sessions: ${studyStats.sessionsToday}</span>
            <span>Tasks completed: ${studyStats.tasksCompletedToday.length}</span>
          </div>
        `)}

        ${card(`
          <h3>This week</h3>
          <div class="week-chart" role="img" aria-label="Daily completion for the last 7 days: ${week.map((w) => `${weekdayNarrow(w.date)} ${w.pct}%`).join(', ')}">
            ${week.map((w) => `
              <div class="week-bar-wrap">
                <div class="week-bar ${w.date === date ? 'week-bar-today' : ''}" style="height:${Math.max(4, w.pct)}%"></div>
                <span class="week-bar-label" aria-hidden="true">${weekdayNarrow(w.date)}</span>
              </div>`).join('')}
          </div>
        `)}
      </div>
    `;

    root.querySelectorAll('[data-nav]').forEach((b) => {
      b.addEventListener('click', () => navigate(b.getAttribute('data-nav')));
    });
    root.querySelectorAll('[data-toggle-habit]').forEach((b) => {
      b.addEventListener('click', () => { toggleBoolean(store, b.getAttribute('data-toggle-habit')); draw(); });
    });
    root.querySelector('#qa-study').addEventListener('click', () => openQuickCheckinModal(store, draw));
    root.querySelector('#qa-badminton').addEventListener('click', () => openSessionEditor(store, draw));
    const workoutBtn = root.querySelector('#qa-workout');
    if (fitnessHabit) workoutBtn.addEventListener('click', () => { toggleBoolean(store, fitnessHabit.id, date); draw(); });
    root.querySelectorAll('[data-focus-index]').forEach((b) => {
      b.addEventListener('click', () => {
        const it = focusItems[+b.getAttribute('data-focus-index')];
        if (it.action === 'log-study') openQuickCheckinModal(store, draw);
        else if (it.toggleHabit) { toggleBoolean(store, it.toggleHabit); draw(); }
        else if (it.route) navigate(it.route);
      });
    });
  }

  draw();
}
