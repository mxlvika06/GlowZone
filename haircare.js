import { todayStr, escapeHtml, formatDateShort } from './utils.js';
import { card, toast, autosave, confirmDialog } from './components.js';

export function renderHaircare(root, store) {
  function draw() {
    const state = store.get();
    const date = todayStr();
    const dayLog = state.haircareLog[date] || { steps: [], note: '' };
    const habit = state.habits.find((h) => h.id === 'h_hair') || state.habits.find((h) => h.categoryId === 'hair');
    const pastLogs = Object.entries(state.haircareLog)
      .filter(([d, v]) => d !== date && v.steps && v.steps.length)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 10);
    const doneCount = state.haircare.steps.filter((st) => dayLog.steps.includes(st)).length;

    root.innerHTML = `
      <div class="page">
        <header class="page-header"><h1>💇 Hair care</h1></header>

        ${card(`
          <div class="row-between"><h3>Today's routine</h3>${state.haircare.steps.length ? `<span class="badge">${doneCount}/${state.haircare.steps.length}</span>` : ''}</div>
          <div>${state.haircare.steps.length ? state.haircare.steps.map((step) => `
            <div class="checkbox-row ${dayLog.steps.includes(step) ? 'checked' : ''}">
              <label class="check-main">
                <input type="checkbox" data-step="${escapeHtml(step)}" ${dayLog.steps.includes(step) ? 'checked' : ''} />
                <span>${escapeHtml(step)}</span>
              </label>
              <button type="button" class="icon-btn" data-remove-step="${escapeHtml(step)}" aria-label="Remove step ${escapeHtml(step)}">✕</button>
            </div>`).join('') : '<p class="empty-state">No routine steps yet — add one below.</p>'}
          </div>
        `)}

        ${card(`
          <h3>Today's note</h3>
          <p class="muted small">Products used, hair observations, anything worth remembering. Saved automatically.</p>
          <textarea class="input" id="hair-note" rows="3" placeholder="Notes..." aria-label="Today's hair note"></textarea>
        `)}

        ${card(`
          <h3>Add a step</h3>
          <div class="add-row">
            <input class="input" id="new-step" placeholder="e.g. Hair mask" aria-label="New step name" style="flex:1" />
            <button class="btn" id="add-step">Add</button>
          </div>
        `)}

        ${card(`
          <h3>Recent wash days</h3>
          <div class="list">${pastLogs.length ? pastLogs.map(([d, v]) => `
            <div class="list-item"><div><strong>${escapeHtml(formatDateShort(d))}</strong><div class="muted small">${v.steps.map(escapeHtml).join(', ')}</div>${v.note ? `<div class="muted small">${escapeHtml(v.note)}</div>` : ''}</div></div>
          `).join('') : '<p class="empty-state">No earlier wash days logged yet.</p>'}</div>
        `)}
      </div>
    `;

    const note = root.querySelector('#hair-note');
    note.value = dayLog.note || '';
    autosave(note, (value) => {
      store.update((s) => {
        if (!s.haircareLog[date]) s.haircareLog[date] = { steps: [], note: '' };
        s.haircareLog[date].note = value;
      });
    });

    root.querySelectorAll('[data-step]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const step = cb.getAttribute('data-step');
        store.update((s) => {
          if (!s.haircareLog[date]) s.haircareLog[date] = { steps: [], note: '' };
          const list = s.haircareLog[date].steps;
          const idx = list.indexOf(step);
          if (idx >= 0) list.splice(idx, 1); else list.push(step);
          if (habit) {
            if (!s.logs[date]) s.logs[date] = {};
            s.logs[date][habit.id] = list.length > 0;
          }
        });
        draw();
      });
    });

    root.querySelectorAll('[data-remove-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = btn.getAttribute('data-remove-step');
        if (!confirmDialog(`Remove "${step}" from your hair routine? Past logs keep it.`)) return;
        store.update((s) => { s.haircare.steps = s.haircare.steps.filter((x) => x !== step); });
        draw();
      });
    });

    const addStep = () => {
      const input = root.querySelector('#new-step');
      const val = input.value.trim();
      if (!val) { toast('Type a step name first', 'error'); input.focus(); return; }
      store.update((s) => { if (!s.haircare.steps.includes(val)) s.haircare.steps.push(val); });
      draw();
    };
    root.querySelector('#add-step').addEventListener('click', addStep);
    root.querySelector('#new-step').addEventListener('keydown', (e) => { if (e.key === 'Enter') addStep(); });
  }

  draw();
}
