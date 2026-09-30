import { todayStr, escapeHtml } from '../utils.js';
import { card, toast, autosave, confirmDialog } from '../components.js';

function getDayLog(state, date) {
  return state.skincareLog[date] || { morning: [], night: [], note: '' };
}

const HABIT_FOR = { morning: 'h_skin_am', night: 'h_skin_pm' };
const STEPS_KEY = { morning: 'morningSteps', night: 'nightSteps' };

/** A routine counts as done once every CURRENT step in it is checked. */
function syncHabit(s, date, which) {
  const steps = s.skincare[STEPS_KEY[which]];
  const done = s.skincareLog[date]?.[which] || [];
  const allDone = steps.length > 0 && steps.every((st) => done.includes(st));
  if (!s.logs[date]) s.logs[date] = {};
  s.logs[date][HABIT_FOR[which]] = allDone;
}

export function renderSkincare(root, store) {
  function draw() {
    const state = store.get();
    const date = todayStr();
    const dayLog = getDayLog(state, date);

    root.innerHTML = `
      <div class="page">
        <header class="page-header"><h1>🧴 Skincare</h1></header>
        <p class="muted small">This tracks your own routine — it makes no medical claims and doesn't diagnose skin conditions.</p>

        <div class="grid grid-2 stack-mobile">
          ${card(renderRoutine('Morning routine', 'morning', state.skincare.morningSteps, dayLog.morning))}
          ${card(renderRoutine('Night routine', 'night', state.skincare.nightSteps, dayLog.night))}
        </div>

        ${card(`
          <h3>Today's note</h3>
          <p class="muted small">Optional — condition, breakouts, texture, anything worth remembering. Saved automatically.</p>
          <textarea class="input" id="skin-note" rows="3" placeholder="How's your skin today?" aria-label="Today's skin note"></textarea>
        `)}

        ${card(`
          <h3>Add a custom step</h3>
          <div class="add-row">
            <select class="input" id="which-routine" aria-label="Which routine" style="max-width:140px">
              <option value="morning">Morning</option>
              <option value="night">Night</option>
            </select>
            <input class="input" id="new-step" placeholder="e.g. Vitamin C serum" aria-label="New step name" style="flex:1;min-width:160px" />
            <button class="btn" id="add-step">Add</button>
          </div>
        `)}
      </div>
    `;

    const note = root.querySelector('#skin-note');
    note.value = dayLog.note || '';
    autosave(note, (value) => {
      store.update((s) => {
        if (!s.skincareLog[date]) s.skincareLog[date] = { morning: [], night: [], note: '' };
        s.skincareLog[date].note = value;
      });
    });

    root.querySelectorAll('[data-step-toggle]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const which = cb.getAttribute('data-which');
        const step = cb.getAttribute('data-step-toggle');
        store.update((s) => {
          if (!s.skincareLog[date]) s.skincareLog[date] = { morning: [], night: [], note: '' };
          const list = s.skincareLog[date][which];
          const idx = list.indexOf(step);
          if (idx >= 0) list.splice(idx, 1); else list.push(step);
          syncHabit(s, date, which);
        });
        draw();
      });
    });

    root.querySelectorAll('[data-remove-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const which = btn.getAttribute('data-which');
        const step = btn.getAttribute('data-remove-step');
        if (!confirmDialog(`Remove "${step}" from your ${which} routine? Past logs keep it.`)) return;
        store.update((s) => {
          const key = STEPS_KEY[which];
          s.skincare[key] = s.skincare[key].filter((x) => x !== step);
          if (s.skincareLog[date]) syncHabit(s, date, which); // removal can flip "all done"
        });
        draw();
      });
    });

    const addStep = () => {
      const which = root.querySelector('#which-routine').value;
      const input = root.querySelector('#new-step');
      const val = input.value.trim();
      if (!val) { toast('Type a step name first', 'error'); input.focus(); return; }
      store.update((s) => {
        const key = STEPS_KEY[which];
        if (!s.skincare[key].includes(val)) s.skincare[key].push(val);
        if (s.skincareLog[date]) syncHabit(s, date, which); // a new unchecked step means "not all done" any more
      });
      draw();
    };
    root.querySelector('#add-step').addEventListener('click', addStep);
    root.querySelector('#new-step').addEventListener('keydown', (e) => { if (e.key === 'Enter') addStep(); });
  }

  draw();
}

function renderRoutine(title, which, steps, doneList) {
  if (!steps.length) return `<h3>${title}</h3><p class="empty-state">No steps yet — add one below.</p>`;
  const doneCount = steps.filter((st) => doneList.includes(st)).length;
  return `
    <div class="row-between"><h3>${title}</h3><span class="badge">${doneCount}/${steps.length}</span></div>
    <div>
      ${steps.map((step) => `
        <div class="checkbox-row ${doneList.includes(step) ? 'checked' : ''}">
          <label class="check-main">
            <input type="checkbox" data-step-toggle="${escapeHtml(step)}" data-which="${which}" ${doneList.includes(step) ? 'checked' : ''} />
            <span>${escapeHtml(step)}</span>
          </label>
          <button type="button" class="icon-btn" data-remove-step="${escapeHtml(step)}" data-which="${which}" aria-label="Remove step ${escapeHtml(step)}">✕</button>
        </div>
      `).join('')}
    </div>
  `;
}
