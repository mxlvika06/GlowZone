import { uid, todayStr, last7Days, monthPrefix, dayOfMonth, escapeHtml, minutesToLabel, toPositiveInt } from '../utils.js';
import { card, toast, openModal, confirmDialog, progressBar } from '../components.js';

export function studyHabitId(state) {
  const h = state.habits.find((h) => h.id === 'h_study') || state.habits.find((h) => h.categoryId === 'study');
  return h ? h.id : null;
}

/** Mutates state in place — shared by logStudyMinutes() and logStudyCheckin() so every
 * study-time entry point (manual log, quick check-in, focus timer) updates subjects
 * + the h_study habit identically, in exactly one place. */
function applyStudyMinutesToState(state, { subjectId = '', minutes, date }) {
  if (!minutes || minutes <= 0) return;
  if (subjectId) {
    const sub = state.subjects.find((x) => x.id === subjectId);
    if (sub) {
      if (!sub.studyLog) sub.studyLog = {};
      sub.studyLog[date] = (sub.studyLog[date] || 0) + minutes;
    }
  }
  const habitId = studyHabitId(state);
  if (habitId) {
    if (!state.logs[date]) state.logs[date] = {};
    state.logs[date][habitId] = (state.logs[date][habitId] || 0) + minutes;
  }
}

/**
 * Shared study-time logging used by both the manual "Log study time" dialog
 * on this page and the Focus Timer (js/sections/focusTimer.js), so both
 * paths update subjects + the h_study habit identically.
 */
export function logStudyMinutes(store, { subjectId = '', minutes, date = todayStr() }) {
  if (!minutes || minutes <= 0) return;
  store.update((s) => applyStudyMinutesToState(s, { subjectId, minutes, date }));
}

/**
 * Fast daily check-in: logs minutes (same as logStudyMinutes) AND records a
 * lightweight entry (topic / tasks completed / notes) so Today's view can
 * show what was actually studied, not just a total. Single store.update()
 * call so it's one atomic save + one re-render.
 */
export function logStudyCheckin(store, { date = todayStr(), subjectId = '', minutes, topic = '', tasksCompleted = '', notes = '' }) {
  minutes = +minutes || 0;
  if (minutes <= 0) return null;
  const record = {
    id: uid('chk'), date, subjectId, minutes,
    topic: topic.trim(), tasksCompleted: tasksCompleted.trim(), notes: notes.trim(),
    loggedAt: new Date().toISOString(),
  };
  store.update((s) => {
    if (!s.studyCheckins) s.studyCheckins = [];
    s.studyCheckins.push(record);
    applyStudyMinutesToState(s, { subjectId, minutes, date });
  });
  return record;
}

/** Combined list of quick check-ins + focus-timer sessions for a single date,
 * normalized to a common shape. Used for "sessions today", topic lists, etc. */
export function getStudyEntriesForDate(state, date) {
  const checkins = (state.studyCheckins || [])
    .filter((c) => c.date === date)
    .map((c) => ({ id: c.id, subjectId: c.subjectId, minutes: c.minutes, topic: c.topic, tasksCompleted: c.tasksCompleted, notes: c.notes, source: 'checkin' }));
  const sessions = (state.focusSessions || [])
    .filter((s) => s.date === date && (s.actualMinutes || 0) > 0)
    .map((s) => ({ id: s.id, subjectId: s.subjectId, minutes: s.actualMinutes, topic: s.task, tasksCompleted: '', notes: s.reflection, source: 'focus' }));
  return [...checkins, ...sessions];
}

function studyMinutesWhere(state, datePredicate) {
  const habitId = studyHabitId(state);
  if (!habitId) return 0;
  return Object.entries(state.logs).reduce((a, [d, log]) => (datePredicate(d) ? a + (log[habitId] || 0) : a), 0);
}

/** Today / this week / this month / all-time-so-far study stats, built from
 * the h_study habit log (the single source of truth for total minutes, since
 * every logging path funnels through applyStudyMinutesToState above) plus
 * subject.studyLog for the per-subject breakdown. */
export function computeStudyStats(state, date = todayStr()) {
  const week = last7Days();
  const weekSet = new Set(week);
  const mPrefix = monthPrefix(date);

  const todayMinutes = studyMinutesWhere(state, (d) => d === date);
  const weekMinutes = studyMinutesWhere(state, (d) => weekSet.has(d));
  const monthMinutes = studyMinutesWhere(state, (d) => d.startsWith(mPrefix));

  const todayEntries = getStudyEntriesForDate(state, date);
  const weekEntries = week.flatMap((d) => getStudyEntriesForDate(state, d));
  const allCheckinsAndSessions = [...(state.studyCheckins || []).map((c) => ({ date: c.date, minutes: c.minutes })), ...(state.focusSessions || []).map((s) => ({ date: s.date, minutes: s.actualMinutes || 0 }))];
  const monthEntries = allCheckinsAndSessions.filter((e) => e.date.startsWith(mPrefix) && e.minutes > 0);

  const perSubjectToday = state.subjects.map((sub) => ({ subject: sub, minutes: sub.studyLog?.[date] || 0 })).filter((x) => x.minutes > 0);
  const subjectMinutesToday = perSubjectToday.reduce((a, x) => a + x.minutes, 0);
  const generalToday = Math.max(0, todayMinutes - subjectMinutesToday);

  const perSubjectWeek = state.subjects
    .map((sub) => ({ subject: sub, minutes: week.reduce((a, d) => a + (sub.studyLog?.[d] || 0), 0) }))
    .filter((x) => x.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const daysStudiedThisWeek = week.filter((d) => studyMinutesWhere(state, (x) => x === d) > 0).length;
  const elapsedInMonth = dayOfMonth(date);
  let daysStudiedThisMonth = 0;
  for (let i = 0; i < elapsedInMonth; i++) {
    const d = `${mPrefix}-${String(i + 1).padStart(2, '0')}`;
    if (studyMinutesWhere(state, (x) => x === d) > 0) daysStudiedThisMonth++;
  }

  const goalMinutes = state.settings.studyGoalMinutes || 180;

  // "Topics covered today" — prefer each subject's defined topic list (marks
  // ✓/○ based on whether today's check-ins mention it); falls back to the
  // freeform topics typed into today's check-ins if no subject has topics set up.
  const topicRows = [];
  let anySubjectTopics = false;
  state.subjects.forEach((sub) => {
    if (!sub.topics || !sub.topics.length) return;
    anySubjectTopics = true;
    const todaysForSubject = todayEntries.filter((e) => e.subjectId === sub.id);
    sub.topics.forEach((topic) => {
      const escaped = topic.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = escaped ? new RegExp(`\\b${escaped}\\b`, 'i') : null;
      const done = re ? todaysForSubject.some((e) => re.test(e.topic || '')) : false;
      topicRows.push({ label: state.subjects.length > 1 ? `${topic} (${sub.name})` : topic, done });
    });
  });
  if (!anySubjectTopics) {
    todayEntries.filter((e) => e.topic).forEach((e) => topicRows.push({ label: e.topic, done: true }));
  }

  const tasksCompletedToday = todayEntries
    .flatMap((e) => (e.tasksCompleted || '').split(/[,;\n]/).map((t) => t.trim()).filter(Boolean));

  return {
    date, goalMinutes,
    todayMinutes, weekMinutes, monthMinutes,
    perSubjectToday, generalToday,
    perSubjectWeek,
    sessionsToday: todayEntries.length,
    sessionsWeek: weekEntries.length,
    sessionsMonth: monthEntries.length,
    daysStudiedThisWeek, daysStudiedThisMonth, elapsedInMonth,
    topicRows, tasksCompletedToday,
  };
}

const TASK_TYPES = [
  { id: 'assignment', label: 'Assignment', icon: '📝' },
  { id: 'exam', label: 'Exam', icon: '🧪' },
  { id: 'deadline', label: 'Deadline', icon: '⏰' },
  { id: 'other', label: 'Other', icon: '📌' },
];

function taskTypeMeta(id) {
  return TASK_TYPES.find((t) => t.id === id) || TASK_TYPES[3];
}

export function daysUntil(dateStr) {
  const today = new Date(todayStr() + 'T00:00:00');
  const due = new Date(dateStr + 'T00:00:00');
  return Math.round((due - today) / 86400000);
}

export function dueLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d > 1) return `Due in ${d} days`;
  if (d === -1) return '1 day overdue';
  return `${-d} days overdue`;
}

function renderTodayCard(state, stats) {
  const pct = Math.min(100, Math.round((stats.todayMinutes / (stats.goalMinutes || 1)) * 100));
  const subjectLines = stats.perSubjectToday
    .map((x) => `<div class="row-between small" style="padding:4px 0"><span>${escapeHtml(x.subject.name)}</span><span class="muted">${minutesToLabel(x.minutes)}</span></div>`)
    .join('');
  const generalLine = stats.generalToday > 0
    ? `<div class="row-between small" style="padding:4px 0"><span class="muted">General / no subject</span><span class="muted">${minutesToLabel(stats.generalToday)}</span></div>`
    : '';
  const topicsHtml = stats.topicRows.length
    ? `<div class="checklist" style="margin-top:8px">${stats.topicRows.map((t) => `<div class="small" style="padding:2px 0">${t.done ? '✓' : '○'} <span class="${t.done ? '' : 'muted'}">${escapeHtml(t.label)}</span></div>`).join('')}</div>`
    : '';
  const tasksHtml = stats.tasksCompletedToday.length
    ? `<div class="checklist" style="margin-top:8px">${stats.tasksCompletedToday.map((t) => `<div class="small" style="padding:2px 0">✓ ${escapeHtml(t)}</div>`).join('')}</div>`
    : '';

  return card(`
    <div class="row-between">
      <h3>Today</h3>
      <button class="btn btn-sm btn-ghost" id="edit-goal">Edit goal</button>
    </div>
    <div class="muted small">Study goal: ${minutesToLabel(stats.goalMinutes)} / day</div>
    <div class="row-between" style="margin-top:6px"><strong>${minutesToLabel(stats.todayMinutes)} / ${minutesToLabel(stats.goalMinutes)}</strong><span class="muted small">${pct}%</span></div>
    <div style="margin:6px 0 10px">${progressBar(pct, 'Study goal progress')}</div>

    ${subjectLines || generalLine ? `<div style="margin-top:4px">${subjectLines}${generalLine}</div>` : '<p class="muted small">Nothing logged yet today — tap "+ Log Study" to check in.</p>'}

    ${stats.topicRows.length ? `<div class="muted small" style="margin-top:12px;font-weight:600">Topics</div>${topicsHtml}` : ''}
    ${stats.tasksCompletedToday.length ? `<div class="muted small" style="margin-top:12px;font-weight:600">Tasks completed</div>${tasksHtml}` : ''}

    <button class="btn btn-primary btn-block" id="open-checkin" style="margin-top:14px">+ Log Study</button>
  `);
}

function renderProgressCard(state, stats) {
  const weekConsistency = `${stats.daysStudiedThisWeek}/7 days`;
  const monthConsistency = `${stats.daysStudiedThisMonth}/${stats.elapsedInMonth} days`;
  const maxSubjectWeek = Math.max(1, ...stats.perSubjectWeek.map((x) => x.minutes));
  const subjectBars = stats.perSubjectWeek.length
    ? stats.perSubjectWeek.map((x) => `
        <div style="margin:8px 0">
          <div class="row-between small"><span>${escapeHtml(x.subject.name)}</span><span class="muted">${minutesToLabel(x.minutes)}</span></div>
          <div class="progress-bar" style="margin-top:4px"><div class="progress-bar-fill" style="width:${Math.round((x.minutes / maxSubjectWeek) * 100)}%"></div></div>
        </div>`).join('')
    : '<p class="muted small">No study time logged this week yet.</p>';

  return card(`
    <h3>Progress</h3>
    <div class="grid grid-3">
      <div><div class="stat-big">${minutesToLabel(stats.todayMinutes)}</div><div class="stat-label">Today</div></div>
      <div><div class="stat-big">${minutesToLabel(stats.weekMinutes)}</div><div class="stat-label">This week</div></div>
      <div><div class="stat-big">${minutesToLabel(stats.monthMinutes)}</div><div class="stat-label">This month</div></div>
    </div>
    <div class="grid grid-2" style="margin-top:10px">
      <div><div class="stat-big">${stats.sessionsWeek}</div><div class="stat-label">Sessions this week</div></div>
      <div><div class="stat-big">${stats.sessionsMonth}</div><div class="stat-label">Sessions this month</div></div>
    </div>
    <hr class="sep" style="margin-top:14px" />
    <div class="row-between small"><span class="muted">Consistency (week)</span><span>${weekConsistency}</span></div>
    <div class="row-between small" style="margin-top:4px"><span class="muted">Consistency (month)</span><span>${monthConsistency}</span></div>
    <div class="muted small" style="margin-top:6px">Just the numbers — a shorter day isn't a failure, it's data.</div>
    <hr class="sep" style="margin-top:14px" />
    <div class="muted small" style="font-weight:600;margin-bottom:2px">Subject time this week</div>
    ${subjectBars}
  `);
}

/**
 * Fast daily check-in modal — the primary way to log study progress in
 * ~30–60s. Reachable from the Study page, each subject card, and the
 * dashboard "+ Log Study" quick action. Remembers the last-used subject/
 * duration for the session (in-memory only) so repeat entries are faster.
 * `presetSubjectId` (optional) preselects a subject, e.g. from a subject card.
 */
const lastCheckin = { subjectId: '', minutes: 25 };

export function openQuickCheckinModal(store, onDone = () => {}, presetSubjectId = '') {
  const state = store.get();
  const durations = [15, 25, 30, 45, 60, 90];
  const today = todayStr();
  const startSubject = presetSubjectId && state.subjects.some((s) => s.id === presetSubjectId) ? presetSubjectId : lastCheckin.subjectId;
  const startMinutes = lastCheckin.minutes;

  const overlay = openModal(`
    <h3>Log study time</h3>
    <label id="ci-dur-label">Duration</label>
    <div class="chip-remove" id="dur-chips" role="group" aria-labelledby="ci-dur-label">
      ${durations.map((m) => `<button type="button" class="chip ${m === startMinutes ? 'active' : ''}" aria-pressed="${m === startMinutes}" data-dur="${m}">${m}m</button>`).join('')}
    </div>
    <input class="input" id="ci-minutes" type="number" inputmode="numeric" min="1" max="1440" value="${startMinutes}" aria-label="Duration in minutes" style="margin-top:8px" />

    <label for="ci-subject">Subject</label>
    <select class="input" id="ci-subject">
      <option value="">No subject / general</option>
      ${state.subjects.map((s) => `<option value="${s.id}" ${s.id === startSubject ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
    </select>

    <label for="ci-topic">Topic (optional)</label>
    <input class="input" id="ci-topic" placeholder="What did you study?" autocomplete="off" />

    <label for="ci-tasks">Tasks completed (optional, comma-separated)</label>
    <input class="input" id="ci-tasks" placeholder="e.g. Chapter 3 exercises, Flashcards" autocomplete="off" />

    <label for="ci-notes">Notes (optional)</label>
    <textarea class="input" id="ci-notes" rows="2" placeholder="Anything worth remembering?"></textarea>

    <label for="ci-date">Date</label>
    <input class="input" id="ci-date" type="date" value="${today}" max="${today}" />

    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="ci-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="ci-save">Save check-in</button>
    </div>
  `);

  const minutesInput = overlay.querySelector('#ci-minutes');
  const chips = [...overlay.querySelectorAll('[data-dur]')];
  const syncChips = () => chips.forEach((c) => {
    const on = c.getAttribute('data-dur') === String(minutesInput.value);
    c.classList.toggle('active', on);
    c.setAttribute('aria-pressed', String(on));
  });
  chips.forEach((chip) => chip.addEventListener('click', () => { minutesInput.value = chip.getAttribute('data-dur'); syncChips(); }));
  minutesInput.addEventListener('input', syncChips);

  function save() {
    const minutes = toPositiveInt(minutesInput.value, 0);
    if (minutes <= 0) { toast('Enter a duration in minutes', 'error'); minutesInput.focus(); return; }
    if (minutes > 1440) { toast("That's more than a day — check the duration", 'error'); minutesInput.focus(); return; }
    const date = overlay.querySelector('#ci-date').value || todayStr();
    if (date > todayStr()) { toast("Study can't be logged for a future date", 'error'); return; }
    const subjectId = overlay.querySelector('#ci-subject').value;
    lastCheckin.subjectId = subjectId;
    lastCheckin.minutes = minutes;
    logStudyCheckin(store, {
      date, subjectId, minutes,
      topic: overlay.querySelector('#ci-topic').value,
      tasksCompleted: overlay.querySelector('#ci-tasks').value,
      notes: overlay.querySelector('#ci-notes').value,
    });
    toast(`+${minutesToLabel(minutes)} logged 📚`);
    overlay.remove();
    onDone();
  }
  overlay.querySelector('#ci-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#ci-save').addEventListener('click', save);
  overlay.querySelectorAll('input').forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }));
}

function openGoalEditor(store, onDone) {
  const current = store.get().settings.studyGoalMinutes || 180;
  const presets = [60, 90, 120, 150, 180, 240, 300];
  const overlay = openModal(`
    <h3>Daily study goal</h3>
    <div class="chip-remove" id="goal-chips" role="group" aria-label="Goal presets">
      ${presets.map((m) => `<button type="button" class="chip ${m === current ? 'active' : ''}" aria-pressed="${m === current}" data-goal="${m}">${minutesToLabel(m)}</button>`).join('')}
    </div>
    <label for="goal-minutes" style="margin-top:10px">Custom (minutes)</label>
    <input class="input" id="goal-minutes" type="number" inputmode="numeric" min="1" max="1440" value="${current}" />
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="goal-cancel">Cancel</button>
      <button type="button" class="btn btn-primary" id="goal-save">Save</button>
    </div>
  `);
  const input = overlay.querySelector('#goal-minutes');
  const chips = [...overlay.querySelectorAll('[data-goal]')];
  const syncChips = () => chips.forEach((c) => {
    const on = c.getAttribute('data-goal') === String(input.value);
    c.classList.toggle('active', on);
    c.setAttribute('aria-pressed', String(on));
  });
  chips.forEach((chip) => chip.addEventListener('click', () => { input.value = chip.getAttribute('data-goal'); syncChips(); }));
  input.addEventListener('input', syncChips);
  const save = () => {
    const minutes = toPositiveInt(input.value, 0);
    if (minutes <= 0 || minutes > 1440) { toast('Enter a goal between 1 and 1440 minutes', 'error'); return; }
    store.update((s) => { s.settings.studyGoalMinutes = minutes; });
    overlay.remove();
    onDone();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  overlay.querySelector('#goal-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#goal-save').addEventListener('click', save);
}

export function renderStudy(root, store) {
  function draw() {
    const state = store.get();
    const stats = computeStudyStats(state);

    root.innerHTML = `
      <div class="page">
        <header class="page-header"><h1>📚 Study</h1></header>

        ${renderTodayCard(state, stats)}
        ${renderProgressCard(state, stats)}

        ${card(`
          <div class="row-between"><h3>Subjects</h3><button class="btn btn-primary" id="add-subject">+ New subject</button></div>
          <div class="list">${renderSubjects(state)}</div>
        `)}

        ${card(`
          <div class="row-between"><h3>Deadlines &amp; tasks</h3><button class="btn btn-primary" id="add-task">+ New task</button></div>
          <p class="muted small">Assignments, exams, and deadlines — soonest first.</p>
          <div class="timeline">${renderTimeline(state)}</div>
        `)}

        ${card(`<a class="btn btn-block" href="#/focus">⏱ Open Focus Timer</a>`)}
      </div>
    `;

    root.querySelector('#open-checkin').addEventListener('click', () => openQuickCheckinModal(store, draw));
    root.querySelector('#edit-goal').addEventListener('click', () => openGoalEditor(store, draw));
    root.querySelector('#add-subject').addEventListener('click', () => openSubjectEditor(store, null, draw));
    root.querySelector('#add-task').addEventListener('click', () => openTaskEditor(store, null, draw));

    root.querySelectorAll('[data-log-time]').forEach((btn) => {
      btn.addEventListener('click', () => openQuickCheckinModal(store, draw, btn.getAttribute('data-log-time')));
    });
    root.querySelectorAll('[data-edit-subject]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sub = store.get().subjects.find((s) => s.id === btn.getAttribute('data-edit-subject'));
        openSubjectEditor(store, sub, draw);
      });
    });
    root.querySelectorAll('[data-delete-subject]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirmDialog('Delete this subject? Its logged study time will remain in your totals but the subject will be removed.')) return;
        const id = btn.getAttribute('data-delete-subject');
        store.update((s) => { s.subjects = s.subjects.filter((x) => x.id !== id); });
        draw();
      });
    });

    root.querySelectorAll('[data-toggle-task]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-toggle-task');
        store.update((s) => { const t = s.tasks.find((t) => t.id === id); if (t) t.completed = cb.checked; });
        draw();
      });
    });
    root.querySelectorAll('[data-edit-task]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = store.get().tasks.find((t) => t.id === btn.getAttribute('data-edit-task'));
        openTaskEditor(store, t, draw);
      });
    });
    root.querySelectorAll('[data-delete-task]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirmDialog('Delete this task?')) return;
        const id = btn.getAttribute('data-delete-task');
        store.update((s) => { s.tasks = s.tasks.filter((x) => x.id !== id); });
        draw();
      });
    });
  }

  draw();
}

function renderSubjects(state) {
  if (!state.subjects.length) return '<p class="empty-state">No subjects yet — add one to start tracking study time and progress.</p>';
  return state.subjects.map((sub) => {
    const upcoming = state.tasks
      .filter((t) => t.subjectId === sub.id && !t.completed)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    const shown = upcoming.slice(0, 2);
    return `
    <div class="list-item" style="flex-direction:column;align-items:stretch">
      <div class="row-between">
        <strong>${escapeHtml(sub.name)}</strong>
        <span class="badge">${sub.progressPct || 0}%</span>
      </div>
      <div class="progress-bar" style="margin:8px 0"><div class="progress-bar-fill" style="width:${sub.progressPct || 0}%"></div></div>
      ${sub.topics && sub.topics.length ? `<div class="muted small">Topics: ${sub.topics.map(escapeHtml).join(', ')}</div>` : ''}
      ${shown.length ? `<div class="muted small">Upcoming: ${shown.map((t) => `${taskTypeMeta(t.type).icon} ${escapeHtml(t.title)} (${dueLabel(t.dueDate)})`).join(' · ')}${upcoming.length > shown.length ? ` +${upcoming.length - shown.length} more` : ''}</div>` : ''}
      <div class="list-item-actions" style="margin-top:8px">
        <button class="btn btn-sm btn-primary" data-log-time="${sub.id}">Log study time</button>
        <button class="btn btn-sm btn-ghost" data-edit-subject="${sub.id}">Edit</button>
        <button class="btn btn-sm btn-ghost" data-delete-subject="${sub.id}">Delete</button>
      </div>
    </div>
  `;
  }).join('');
}

function renderTimeline(state) {
  if (!state.tasks.length) return '<p class="empty-state">No deadlines yet — add an assignment, exam, or deadline above.</p>';
  const open = state.tasks.filter((t) => !t.completed).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const done = state.tasks.filter((t) => t.completed).sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
  const sorted = [...open, ...done];
  return sorted.map((t) => {
    const meta = taskTypeMeta(t.type);
    const overdue = !t.completed && daysUntil(t.dueDate) < 0;
    const soon = !t.completed && daysUntil(t.dueDate) >= 0 && daysUntil(t.dueDate) <= 2;
    const subject = state.subjects.find((s) => s.id === t.subjectId);
    return `
      <div class="timeline-item ${t.completed ? 'timeline-done' : ''} ${overdue ? 'timeline-overdue' : ''} ${soon ? 'timeline-soon' : ''}">
        <div class="timeline-dot">${meta.icon}</div>
        <div class="timeline-body">
          <label class="row-between" style="cursor:pointer">
            <span><input type="checkbox" data-toggle-task="${t.id}" ${t.completed ? 'checked' : ''}/> <strong>${escapeHtml(t.title)}</strong></span>
            <span class="muted small">${t.completed ? 'Done' : dueLabel(t.dueDate)}</span>
          </label>
          <div class="muted small">${meta.label}${subject ? ' · ' + escapeHtml(subject.name) : ''} · ${t.dueDate}</div>
          ${t.notes ? `<div class="muted small">${escapeHtml(t.notes)}</div>` : ''}
          <div class="list-item-actions" style="margin-top:6px">
            <button class="btn btn-sm btn-ghost" data-edit-task="${t.id}">Edit</button>
            <button class="btn btn-sm btn-ghost" data-delete-task="${t.id}">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openSubjectEditor(store, subject, onDone) {
  const isNew = !subject;
  const draft = subject ? JSON.parse(JSON.stringify(subject)) : { id: uid('subj'), name: '', progressPct: 0, topics: [], studyLog: {} };

  const overlay = openModal(`
    <h3>${isNew ? 'New subject' : 'Edit subject'}</h3>
    <label>Name</label>
    <input class="input" id="sub-name" placeholder="e.g. Linear Algebra" />
    <label>Progress (%)</label>
    <input class="input" id="sub-progress" type="number" min="0" max="100" />
    <label>Topics (comma-separated)</label>
    <input class="input" id="sub-topics" placeholder="e.g. Vectors, Matrices, Eigenvalues" />
    <div class="modal-actions">
      <button class="btn btn-ghost" id="sub-cancel">Cancel</button>
      <button class="btn btn-primary" id="sub-save">Save</button>
    </div>
  `);

  overlay.querySelector('#sub-name').value = draft.name;
  overlay.querySelector('#sub-progress').value = draft.progressPct;
  overlay.querySelector('#sub-topics').value = (draft.topics || []).join(', ');

  overlay.querySelector('#sub-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#sub-save').addEventListener('click', () => {
    const name = overlay.querySelector('#sub-name').value.trim();
    if (!name) { toast('Please name the subject', 'error'); return; }
    draft.name = name;
    draft.progressPct = Math.max(0, Math.min(100, +overlay.querySelector('#sub-progress').value || 0));
    draft.topics = overlay.querySelector('#sub-topics').value.split(',').map((t) => t.trim()).filter(Boolean);
    store.update((s) => {
      const idx = s.subjects.findIndex((x) => x.id === draft.id);
      if (idx >= 0) s.subjects[idx] = draft; else s.subjects.push(draft);
    });
    overlay.remove();
    onDone();
  });
}

function openTaskEditor(store, task, onDone) {
  const isNew = !task;
  const state = store.get();
  const draft = task ? { ...task } : { id: uid('task'), subjectId: '', title: '', type: 'assignment', dueDate: todayStr(), completed: false, notes: '' };

  const overlay = openModal(`
    <h3>${isNew ? 'New task' : 'Edit task'}</h3>
    <label>Title</label>
    <input class="input" id="t-title" placeholder="e.g. Problem set 4" />
    <label>Type</label>
    <select class="input" id="t-type">${TASK_TYPES.map((t) => `<option value="${t.id}">${t.icon} ${t.label}</option>`).join('')}</select>
    <label>Subject (optional)</label>
    <select class="input" id="t-subject">
      <option value="">No subject</option>
      ${state.subjects.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
    </select>
    <label>Due date</label>
    <input class="input" id="t-due" type="date" />
    <label>Notes</label>
    <textarea class="input" id="t-notes" rows="2"></textarea>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="t-cancel">Cancel</button>
      <button class="btn btn-primary" id="t-save">Save</button>
    </div>
  `);

  overlay.querySelector('#t-title').value = draft.title;
  overlay.querySelector('#t-type').value = draft.type;
  overlay.querySelector('#t-subject').value = draft.subjectId || '';
  overlay.querySelector('#t-due').value = draft.dueDate;
  overlay.querySelector('#t-notes').value = draft.notes || '';

  overlay.querySelector('#t-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#t-save').addEventListener('click', () => {
    const title = overlay.querySelector('#t-title').value.trim();
    if (!title) { toast('Please give the task a title', 'error'); return; }
    const dueDate = overlay.querySelector('#t-due').value;
    if (!dueDate) { toast('Please pick a due date', 'error'); return; }
    draft.title = title;
    draft.type = overlay.querySelector('#t-type').value;
    draft.subjectId = overlay.querySelector('#t-subject').value;
    draft.dueDate = dueDate;
    draft.notes = overlay.querySelector('#t-notes').value;
    store.update((s) => {
      const idx = s.tasks.findIndex((x) => x.id === draft.id);
      if (idx >= 0) s.tasks[idx] = draft; else s.tasks.push(draft);
    });
    overlay.remove();
    onDone();
  });
}
