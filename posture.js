import { uid, todayStr, escapeHtml } from '../utils.js';
import { card, toast, confirmDialog } from '../components.js';
import { getLog, toggleBoolean, habitsForCategory } from '../habits.js';

export function renderPosture(root, store) {
  function draw() {
    const state = store.get();
    const date = todayStr();
    const habits = habitsForCategory(state, 'posture');
    const log = getLog(state, date);
    const doneCount = habits.filter((h) => log[h.id]).length;

    root.innerHTML = `
      <div class="page">
        <header class="page-header"><h1>🧍 Posture &amp; physical habits</h1></header>
        <p class="muted small">Purpose is consistency, not perfection — missing a day is fine.</p>

        ${card(`
          <div class="row-between"><h3>Today's habits</h3>${habits.length ? `<span class="badge">${doneCount}/${habits.length}</span>` : ''}</div>
          <div>${habits.length ? habits.map((h) => `
            <div class="checkbox-row ${log[h.id] ? 'checked' : ''}">
              <label class="check-main">
                <input type="checkbox" data-habit="${h.id}" ${log[h.id] ? 'checked' : ''} />
                <span>${escapeHtml(h.label)}</span>
              </label>
              <button type="button" class="icon-btn" data-remove-habit="${h.id}" aria-label="Remove habit ${escapeHtml(h.label)}">✕</button>
            </div>`).join('') : '<p class="empty-state">No habits yet — add one below.</p>'}
          </div>
        `)}

        ${card(`
          <h3>Add a habit</h3>
          <div class="add-row">
            <input class="input" id="new-habit" placeholder="e.g. Neck stretch" aria-label="New habit name" style="flex:1" />
            <button class="btn" id="add-habit">Add</button>
          </div>
        `)}
      </div>
    `;

    root.querySelectorAll('[data-habit]').forEach((cb) => {
      cb.addEventListener('change', () => { toggleBoolean(store, cb.getAttribute('data-habit'), date); draw(); });
    });
    root.querySelectorAll('[data-remove-habit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirmDialog('Remove this habit? Past logs for it are kept but it will no longer appear.')) return;
        const id = btn.getAttribute('data-remove-habit');
        store.update((s) => { s.habits = s.habits.filter((h) => h.id !== id); });
        draw();
      });
    });
    const addHabit = () => {
      const input = root.querySelector('#new-habit');
      const val = input.value.trim();
      if (!val) { toast('Type a habit name first', 'error'); input.focus(); return; }
      store.update((s) => { s.habits.push({ id: uid('h'), categoryId: 'posture', label: val, type: 'boolean', active: true }); });
      draw();
    };
    root.querySelector('#add-habit').addEventListener('click', addHabit);
    root.querySelector('#new-habit').addEventListener('keydown', (e) => { if (e.key === 'Enter') addHabit(); });
  }

  draw();
}
