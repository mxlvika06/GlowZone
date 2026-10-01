import { uid, todayStr, last7Days, escapeHtml, minutesToLabel, formatDateShort } from './utils.js';
import { card, toast, openModal, confirmDialog } from './components.js';

function badmintonHabitId(state) {
  const h = state.habits.find((h) => h.id === 'h_badminton') || state.habits.find((h) => h.categoryId === 'badminton');
  return h ? h.id : null;
}

/** The day's "Badminton practice" habit is ticked exactly when at least one session exists that day. */
function syncBadmintonHabit(s, date) {
  const habitId = badmintonHabitId(s);
  if (!habitId || !date) return;
  const has = s.badmintonSessions.some((x) => x.date === date);
  if (has) { if (!s.logs[date]) s.logs[date] = {}; s.logs[date][habitId] = true; }
  else if (s.logs[date]) s.logs[date][habitId] = false;
}

export function renderBadminton(root, store) {
  function draw() {
    const state = store.get();
    const week = last7Days();
    const weekMinutes = state.badmintonSessions
      .filter((s) => week.includes(s.date))
      .reduce((a, s) => a + (s.durationMin || 0), 0);
    const sessionsSorted = [...state.badmintonSessions].sort((a, b) => (a.date < b.date ? 1 : -1));

    root.innerHTML = `
      <div class="page">
        <header class="page-header"><h1>🏸 Badminton</h1></header>

        <div class="grid grid-2">
          ${card(`<div class="stat-big">${minutesToLabel(weekMinutes)}</div><div class="stat-label">This week's practice</div>`)}
          ${card(`<div class="stat-big">${state.badmintonSessions.length}</div><div class="stat-label">Total sessions logged</div>`)}
        </div>

        ${card(`
          <div class="row-between"><h3>Sessions</h3><button class="btn btn-primary" id="add-session">+ Log session</button></div>
          <div class="list">${renderSessions(sessionsSorted)}</div>
        `)}

        ${card(`
          <h3>Skills tracked</h3>
          <p class="muted small">Used as tags when logging a session. Add or remove freely.</p>
          <div class="chip-remove" id="skills-chips">${state.badmintonSkills.map((sk) => `<span class="chip chip-edit">${escapeHtml(sk)} <button type="button" class="chip-x" data-remove-skill="${escapeHtml(sk)}" aria-label="Remove skill ${escapeHtml(sk)}">✕</button></span>`).join('')}</div>
          <div class="add-row" style="margin-top:12px">
            <input class="input" id="new-skill" placeholder="Add a skill (e.g. Backhand clear)" aria-label="New skill" style="margin-bottom:0" />
            <button class="btn" id="add-skill">Add</button>
          </div>
        `)}
      </div>
    `;

    root.querySelector('#add-session').addEventListener('click', () => openSessionEditor(store, draw));
    root.querySelectorAll('[data-edit-session]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sess = store.get().badmintonSessions.find((x) => x.id === btn.getAttribute('data-edit-session'));
        if (sess) openSessionEditor(store, draw, sess);
      });
    });
    root.querySelectorAll('[data-delete-session]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirmDialog('Delete this session?')) return;
        const id = btn.getAttribute('data-delete-session');
        store.update((s) => {
          const gone = s.badmintonSessions.find((x) => x.id === id);
          s.badmintonSessions = s.badmintonSessions.filter((x) => x.id !== id);
          if (gone) syncBadmintonHabit(s, gone.date);
        });
        draw();
      });
    });
    root.querySelectorAll('[data-remove-skill]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const skill = btn.getAttribute('data-remove-skill');
        store.update((s) => { s.badmintonSkills = s.badmintonSkills.filter((x) => x !== skill); });
        draw();
      });
    });
    const addSkill = () => {
      const input = root.querySelector('#new-skill');
      const val = input.value.trim();
      if (!val) { toast('Type a skill name first', 'error'); input.focus(); return; }
      store.update((s) => { if (!s.badmintonSkills.includes(val)) s.badmintonSkills.push(val); });
      draw();
    };
    root.querySelector('#add-skill').addEventListener('click', addSkill);
    root.querySelector('#new-skill').addEventListener('keydown', (e) => { if (e.key === 'Enter') addSkill(); });
  }

  draw();
}

function renderSessions(sessions) {
  if (!sessions.length) return '<p class="empty-state">No sessions logged yet. Log your first practice above.</p>';
  return sessions.slice(0, 30).map((s) => `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(formatDateShort(s.date))}</strong> · ${minutesToLabel(s.durationMin)} ${s.type ? '· ' + escapeHtml(s.type) : ''}
        ${s.skills && s.skills.length ? `<div class="muted small">${s.skills.map(escapeHtml).join(', ')}</div>` : ''}
        ${s.notes ? `<div class="muted small">${escapeHtml(s.notes)}</div>` : ''}
      </div>
      <div class="list-item-actions">
        <button class="btn btn-sm btn-ghost" data-edit-session="${s.id}" aria-label="Edit session from ${escapeHtml(formatDateShort(s.date))}">Edit</button>
        <button class="btn btn-sm btn-ghost" data-delete-session="${s.id}" aria-label="Delete session from ${escapeHtml(formatDateShort(s.date))}">Delete</button>
      </div>
    </div>
  `).join('');
}

export function openSessionEditor(store, onDone = () => {}, existing = null) {
  const state = store.get();
  const isNew = !existing;
  const originalDate = existing ? existing.date : null;
  const draft = existing
    ? { ...existing, skills: [...(existing.skills || [])] }
    : { id: uid('bs'), date: todayStr(), durationMin: 30, type: '', skills: [], notes: '' };

  const overlay = openModal(`
    <h3>${isNew ? 'Log badminton session' : 'Edit badminton session'}</h3>
    <label for="s-date">Date</label>
    <input class="input" id="s-date" type="date" max="${todayStr()}" />
    <label for="s-duration">Duration (minutes)</label>
    <input class="input" id="s-duration" type="number" inputmode="numeric" min="1" />
    <label for="s-type">Type of practice</label>
    <input class="input" id="s-type" placeholder="e.g. Singles drills, casual match" />
    <label id="s-skills-label">Skills practiced</label>
    <div class="chip-remove" id="s-skills" role="group" aria-labelledby="s-skills-label"></div>
    <label for="s-notes" style="margin-top:10px">Notes</label>
    <textarea class="input" id="s-notes" rows="2" placeholder="Performance observations, how it felt..."></textarea>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="s-cancel">Cancel</button>
      <button class="btn btn-primary" id="s-save">Save</button>
    </div>
  `);

  overlay.querySelector('#s-date').value = draft.date;
  overlay.querySelector('#s-duration').value = draft.durationMin;
  overlay.querySelector('#s-type').value = draft.type || '';
  overlay.querySelector('#s-notes').value = draft.notes || '';

  const skillsWrap = overlay.querySelector('#s-skills');
  skillsWrap.innerHTML = state.badmintonSkills.length
    ? state.badmintonSkills.map((sk) => { const on = draft.skills.includes(sk); return `<button type="button" class="chip ${on ? 'active' : ''}" aria-pressed="${on}" data-skill="${escapeHtml(sk)}">${escapeHtml(sk)}</button>`; }).join('')
    : '<span class="muted small">No skills defined yet — add some on the Badminton page.</span>';
  skillsWrap.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const sk = chip.getAttribute('data-skill');
      if (draft.skills.includes(sk)) { draft.skills = draft.skills.filter((x) => x !== sk); chip.classList.remove('active'); chip.setAttribute('aria-pressed', 'false'); }
      else { draft.skills.push(sk); chip.classList.add('active'); chip.setAttribute('aria-pressed', 'true'); }
    });
  });

  overlay.querySelector('#s-date').addEventListener('input', (e) => { draft.date = e.target.value; });
  overlay.querySelector('#s-duration').addEventListener('input', (e) => { draft.durationMin = +e.target.value || 0; });
  overlay.querySelector('#s-type').addEventListener('input', (e) => { draft.type = e.target.value; });
  overlay.querySelector('#s-notes').addEventListener('input', (e) => { draft.notes = e.target.value; });
  overlay.querySelector('#s-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#s-save').addEventListener('click', () => {
    if (!draft.date) { toast('Please pick a date', 'error'); return; }
    if (draft.date > todayStr()) { toast("Sessions can't be logged for a future date", 'error'); return; }
    if (!(draft.durationMin > 0)) { toast('Enter how many minutes you played', 'error'); overlay.querySelector('#s-duration').focus(); return; }
    store.update((s) => {
      const idx = s.badmintonSessions.findIndex((x) => x.id === draft.id);
      if (idx >= 0) s.badmintonSessions[idx] = draft; else s.badmintonSessions.push(draft);
      syncBadmintonHabit(s, draft.date);
      if (originalDate && originalDate !== draft.date) syncBadmintonHabit(s, originalDate); // moved to another day
    });
    toast(isNew ? 'Session logged 🏸' : 'Session updated');
    overlay.remove();
    onDone();
  });
}
