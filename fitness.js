import { uid, todayStr, last7Days, escapeHtml } from '../utils.js';
import { card, toast, openModal, confirmDialog } from '../components.js';
import { getLog, toggleBoolean, computeHabitStreak } from '../habits.js';

function fitnessHabit(state) {
  return state.habits.find((h) => h.id === 'h_fitness') || state.habits.find((h) => h.categoryId === 'fitness');
}

export function renderFitness(root, store) {
  function draw() {
    const state = store.get();
    const date = todayStr();
    const habit = fitnessHabit(state);
    const doneToday = habit ? !!getLog(state, date)[habit.id] : false;
    const week = last7Days();
    const weekCount = habit ? week.filter((d) => !!getLog(state, d)[habit.id]).length : 0;
    const streak = habit ? computeHabitStreak(state, habit) : 0;

    const totalWorkoutsLogged = Object.values(state.workoutLog || {}).reduce((a, arr) => a + arr.length, 0);

    root.innerHTML = `
      <div class="page">
        <header class="page-header"><h1>🏃 Fitness</h1></header>

        ${card(habit ? `
          <div class="row-between">
            <div><h3>Today</h3><p class="muted">Mark today complete once you've moved your body — any way counts.</p></div>
            <button class="btn ${doneToday ? 'btn-success' : 'btn-primary'}" id="toggle-fitness" aria-pressed="${doneToday}">${doneToday ? '✓ Done today' : 'Mark done'}</button>
          </div>
        ` : `<h3>Today</h3><p class="muted">The Workout habit was deleted, so daily tracking is off here. You can still log workouts below, or re-create a Fitness habit in Settings.</p>`)}

        <div class="grid grid-3">
          ${card(`<div class="stat-big">🔥 ${streak}</div><div class="stat-label">Workout streak</div>`)}
          ${card(`<div class="stat-big">${weekCount}/7</div><div class="stat-label">Active days this week</div>`)}
          ${card(`<div class="stat-big">${totalWorkoutsLogged}</div><div class="stat-label">Logged workouts</div>`)}
        </div>

        ${card(`
          <div class="row-between"><h3>My workouts</h3><button class="btn btn-primary" id="add-workout">+ New workout</button></div>
          <div class="list">${renderWorkoutList(state)}</div>
        `)}
      </div>
    `;

    const toggleBtn = root.querySelector('#toggle-fitness');
    if (toggleBtn) toggleBtn.addEventListener('click', () => {
      toggleBoolean(store, habit.id, date);
      draw();
    });
    root.querySelector('#add-workout').addEventListener('click', () => openWorkoutEditor(store, null, draw));
    root.querySelectorAll('[data-log-workout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-log-workout');
        store.update((s) => {
          if (!s.workoutLog[date]) s.workoutLog[date] = [];
          s.workoutLog[date].push({ id: uid('wl'), workoutId: id, loggedAt: new Date().toISOString() });
          if (!s.logs[date]) s.logs[date] = {};
          if (habit) s.logs[date][habit.id] = true;
        });
        toast('Workout logged 💪');
        draw();
      });
    });
    root.querySelectorAll('[data-edit-workout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const w = store.get().workouts.find((w) => w.id === btn.getAttribute('data-edit-workout'));
        openWorkoutEditor(store, w, draw);
      });
    });
    root.querySelectorAll('[data-delete-workout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirmDialog('Delete this workout? This cannot be undone.')) return;
        const id = btn.getAttribute('data-delete-workout');
        store.update((s) => { s.workouts = s.workouts.filter((w) => w.id !== id); });
        draw();
      });
    });
  }

  draw();
}

function renderWorkoutList(state) {
  if (!state.workouts.length) return '<p class="empty-state">No workouts yet. Create one — you fully control what goes in it.</p>';
  return state.workouts.map((w) => `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(w.name)}</strong>
        <div class="muted small">${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'}${w.notes ? ' · ' + escapeHtml(w.notes) : ''}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-sm btn-primary" data-log-workout="${w.id}">Log today</button>
        <button class="btn btn-sm btn-ghost" data-edit-workout="${w.id}">Edit</button>
        <button class="btn btn-sm btn-ghost" data-delete-workout="${w.id}">Delete</button>
      </div>
    </div>
  `).join('');
}

function openWorkoutEditor(store, workout, onDone) {
  const isNew = !workout;
  const draft = workout
    ? JSON.parse(JSON.stringify(workout))
    : { id: uid('workout'), name: '', exercises: [{ name: '', sets: '', reps: '' }], notes: '' };

  const overlay = openModal(`
    <h3>${isNew ? 'New workout' : 'Edit workout'}</h3>
    <label for="w-name">Name</label>
    <input class="input" id="w-name" placeholder="e.g. Push day" />
    <label>Exercises</label>
    <div id="w-exercises"></div>
    <button class="btn btn-sm" id="w-add-exercise">+ Add exercise</button>
    <label style="margin-top:10px">Notes</label>
    <textarea class="input" id="w-notes" rows="2" placeholder="Optional"></textarea>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="w-cancel">Cancel</button>
      <button class="btn btn-primary" id="w-save">Save</button>
    </div>
  `);

  overlay.querySelector('#w-name').value = draft.name;
  overlay.querySelector('#w-notes').value = draft.notes || '';

  function renderExercises() {
    const wrap = overlay.querySelector('#w-exercises');
    wrap.innerHTML = draft.exercises.map((ex, i) => `
      <div class="exercise-row" data-i="${i}">
        <input class="input" data-f="name" placeholder="Exercise" aria-label="Exercise name" />
        <input class="input input-sm" data-f="sets" placeholder="Sets" aria-label="Sets" inputmode="numeric" />
        <input class="input input-sm" data-f="reps" placeholder="Reps" aria-label="Reps" inputmode="numeric" />
        <button type="button" class="icon-btn" data-remove-exercise="${i}" aria-label="Remove exercise">✕</button>
      </div>
    `).join('');
    wrap.querySelectorAll('.exercise-row').forEach((row) => {
      const i = +row.getAttribute('data-i');
      row.querySelector('[data-f="name"]').value = draft.exercises[i].name || '';
      row.querySelector('[data-f="sets"]').value = draft.exercises[i].sets || '';
      row.querySelector('[data-f="reps"]').value = draft.exercises[i].reps || '';
      row.querySelectorAll('input').forEach((inp) => {
        inp.addEventListener('input', () => { draft.exercises[i][inp.getAttribute('data-f')] = inp.value; });
      });
    });
    wrap.querySelectorAll('[data-remove-exercise]').forEach((b) => {
      b.addEventListener('click', () => { draft.exercises.splice(+b.getAttribute('data-remove-exercise'), 1); renderExercises(); });
    });
  }
  renderExercises();

  overlay.querySelector('#w-add-exercise').addEventListener('click', () => { draft.exercises.push({ name: '', sets: '', reps: '' }); renderExercises(); });
  overlay.querySelector('#w-name').addEventListener('input', (e) => { draft.name = e.target.value; });
  overlay.querySelector('#w-notes').addEventListener('input', (e) => { draft.notes = e.target.value; });
  overlay.querySelector('#w-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#w-save').addEventListener('click', () => {
    if (!draft.name.trim()) { toast('Please name the workout', 'error'); return; }
    draft.exercises = draft.exercises.filter((ex) => ex.name.trim());
    store.update((s) => {
      const idx = s.workouts.findIndex((w) => w.id === draft.id);
      if (idx >= 0) s.workouts[idx] = draft; else s.workouts.push(draft);
    });
    overlay.remove();
    onDone();
  });
}
