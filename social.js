import { todayStr, escapeHtml, formatDateShort } from '../utils.js';
import { card, toast, autosave, confirmDialog } from '../components.js';

const EMPTY_DAY = () => ({ completed: [], wentWell: '', awkward: '', tomorrow: '' });

function dayLogFor(state, date) {
  return state.socialLog[date] || EMPTY_DAY();
}

export function renderSocial(root, store) {
  let editingList = false; // shows a ✕ on each challenge chip so custom ones can be removed

  function draw() {
    const state = store.get();
    const date = todayStr();
    const log = dayLogFor(state, date);
    const habit = state.habits.find((h) => h.id === 'h_social') || state.habits.find((h) => h.categoryId === 'social');

    const pastReflections = Object.entries(state.socialLog)
      .filter(([d, v]) => d !== date && (v.wentWell || v.awkward || v.tomorrow))
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 5);
    const doneCount = state.socialChallenges.filter((c) => log.completed.includes(c)).length;

    root.innerHTML = `
      <div class="page">
        <header class="page-header"><h1>🗣️ Social confidence</h1></header>
        <p class="muted small">Quiet or low-energy days are completely fine — this isn't about a score.</p>

        ${card(`
          <div class="row-between">
            <h3>Today's challenges ${state.socialChallenges.length ? `<span class="badge">${doneCount} done</span>` : ''}</h3>
            <button class="btn btn-sm btn-ghost" id="toggle-edit-list" aria-pressed="${editingList}">${editingList ? 'Done editing' : 'Edit list'}</button>
          </div>
          <p class="muted small">${editingList ? 'Tap ✕ to remove a challenge from your list.' : 'Tap a challenge when you\'ve done it.'}</p>
          <div class="chip-remove" role="group" aria-label="Social challenges">
            ${state.socialChallenges.length ? state.socialChallenges.map((c) => editingList
              ? `<span class="chip chip-edit">${escapeHtml(c)} <button type="button" class="chip-x" data-remove-challenge="${escapeHtml(c)}" aria-label="Remove challenge ${escapeHtml(c)}">✕</button></span>`
              : `<button type="button" class="chip ${log.completed.includes(c) ? 'active' : ''}" aria-pressed="${log.completed.includes(c)}" data-challenge="${escapeHtml(c)}">${escapeHtml(c)}</button>`
            ).join('') : '<p class="empty-state">No challenges yet — add your own below.</p>'}
          </div>
          <div class="add-row" style="margin-top:14px">
            <input class="input" id="new-challenge" placeholder="Add your own challenge" aria-label="New challenge" style="flex:1" />
            <button class="btn" id="add-challenge">Add</button>
          </div>
        `)}

        ${card(`
          <h3>Reflection</h3>
          <p class="muted small">Optional. Saved automatically.</p>
          <label for="r-well">What went well today?</label>
          <textarea class="input" id="r-well" rows="2"></textarea>
          <label for="r-awkward">What felt awkward?</label>
          <textarea class="input" id="r-awkward" rows="2"></textarea>
          <label for="r-tomorrow">What will I try tomorrow?</label>
          <textarea class="input" id="r-tomorrow" rows="2"></textarea>
        `)}

        ${card(`
          <h3>Recent reflections</h3>
          <div class="list">${pastReflections.length ? pastReflections.map(([d, v]) => `
            <div class="list-item">
              <div style="width:100%">
                <strong>${escapeHtml(formatDateShort(d))}</strong>
                ${v.wentWell ? `<div class="muted small">✅ ${escapeHtml(v.wentWell)}</div>` : ''}
                ${v.awkward ? `<div class="muted small">😅 ${escapeHtml(v.awkward)}</div>` : ''}
                ${v.tomorrow ? `<div class="muted small">➡️ ${escapeHtml(v.tomorrow)}</div>` : ''}
              </div>
            </div>`).join('') : '<p class="empty-state">No earlier reflections yet.</p>'}</div>
        `)}
      </div>
    `;

    root.querySelector('#r-well').value = log.wentWell || '';
    root.querySelector('#r-awkward').value = log.awkward || '';
    root.querySelector('#r-tomorrow').value = log.tomorrow || '';

    root.querySelector('#toggle-edit-list').addEventListener('click', () => { editingList = !editingList; draw(); });

    root.querySelectorAll('[data-challenge]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const c = chip.getAttribute('data-challenge');
        store.update((s) => {
          if (!s.socialLog[date]) s.socialLog[date] = EMPTY_DAY();
          const list = s.socialLog[date].completed;
          const idx = list.indexOf(c);
          if (idx >= 0) list.splice(idx, 1); else list.push(c);
          if (habit) {
            if (!s.logs[date]) s.logs[date] = {};
            s.logs[date][habit.id] = list.length > 0;
          }
        });
        draw();
      });
    });

    root.querySelectorAll('[data-remove-challenge]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = btn.getAttribute('data-remove-challenge');
        if (!confirmDialog(`Remove "${c}" from your challenge list? Past logs keep it.`)) return;
        store.update((s) => { s.socialChallenges = s.socialChallenges.filter((x) => x !== c); });
        draw();
      });
    });

    const addChallenge = () => {
      const input = root.querySelector('#new-challenge');
      const val = input.value.trim();
      if (!val) { toast('Type a challenge first', 'error'); input.focus(); return; }
      store.update((s) => { if (!s.socialChallenges.includes(val)) s.socialChallenges.push(val); });
      draw();
    };
    root.querySelector('#add-challenge').addEventListener('click', addChallenge);
    root.querySelector('#new-challenge').addEventListener('keydown', (e) => { if (e.key === 'Enter') addChallenge(); });

    [['r-well', 'wentWell'], ['r-awkward', 'awkward'], ['r-tomorrow', 'tomorrow']].forEach(([id, field]) => {
      autosave(root.querySelector('#' + id), (value) => {
        store.update((s) => {
          if (!s.socialLog[date]) s.socialLog[date] = EMPTY_DAY();
          s.socialLog[date][field] = value;
        });
      });
    });
  }

  draw();
}
