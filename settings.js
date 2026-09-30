import { uid, escapeHtml, todayStr, toPositiveInt } from '../utils.js';
import { CATEGORIES } from '../schema.js';
import { card, toast, confirmDialog, openModal, autosave } from '../components.js';
import { applyTheme } from '../theme.js';

export function renderSettings(root, store) {
  function draw() {
    const state = store.get();

    root.innerHTML = `
      <div class="page">
        <header class="page-header"><h1>⚙️ Settings</h1></header>

        ${card(`
          <h3>Appearance</h3>
          <label for="theme-select">Theme</label>
          <select class="input" id="theme-select">
            <option value="system">Match system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <label for="display-name">Display name (optional)</label>
          <input class="input" id="display-name" placeholder="What should the app call you?" autocomplete="given-name" />
        `)}

        ${card(`
          <h3>Study</h3>
          <label for="study-goal">Daily study goal (minutes)</label>
          <input class="input" id="study-goal" type="number" inputmode="numeric" min="1" max="1440" />
          <p class="muted small">Used for the progress bars on the Study page and dashboard. You can also change it from the Study page.</p>
        `)}

        ${card(`
          <div class="row-between"><h3>Habits</h3><button class="btn btn-primary" id="add-habit">+ New habit</button></div>
          <p class="muted small">These power the daily dashboard, streaks, and weekly chart. Deactivating keeps history but hides it from today's list.</p>
          <div class="list">${renderHabitList(state)}</div>
        `)}

        ${card(`
          <div class="row-between"><h3>Timer presets</h3><button class="btn btn-primary" id="add-preset">+ New preset</button></div>
          <p class="muted small">Shown as quick-pick chips on the Focus Timer page. "Custom" is always available there too.</p>
          <div class="list">${renderPresetList(state)}</div>
        `)}

        ${card(`
          <h3>Data</h3>
          <p class="muted small">Everything is stored locally in this browser only — nothing is sent to a server.</p>
          <div class="quick-actions">
            <button type="button" class="btn" id="export-data">⬇ Export data (JSON)</button>
            <button type="button" class="btn" id="import-btn">⬆ Import data</button>
            <input type="file" id="import-data" accept="application/json,.json" hidden />
            <button type="button" class="btn btn-danger" id="reset-data">Reset all data</button>
          </div>
          ${store.hasBackup() ? `<div class="restore-box"><p class="small" style="margin:0">A copy of your data from just before the last import or reset is stored on this device.</p><button type="button" class="btn btn-sm" id="restore-backup">↩ Restore that copy</button></div>` : ''}
        `)}

        ${card(`
          <h3>About</h3>
          <p class="muted small">Glow-Up OS · Local-first, private by design. Your data never leaves this device unless you export it.</p>
        `)}
      </div>
    `;

    root.querySelector('#theme-select').value = state.settings.theme;
    root.querySelector('#display-name').value = state.settings.displayName || '';

    root.querySelector('#theme-select').addEventListener('change', (e) => {
      store.update((s) => { s.settings.theme = e.target.value; });
      applyTheme(e.target.value);
    });
    autosave(root.querySelector('#display-name'), (value) => {
      store.update((s) => { s.settings.displayName = value.trim(); });
    });

    const goalInput = root.querySelector('#study-goal');
    goalInput.value = state.settings.studyGoalMinutes || 180;
    goalInput.addEventListener('change', () => {
      const m = toPositiveInt(goalInput.value, 0);
      if (m <= 0 || m > 1440) { toast('Enter a goal between 1 and 1440 minutes', 'error'); goalInput.value = store.get().settings.studyGoalMinutes; return; }
      store.update((s) => { s.settings.studyGoalMinutes = m; });
      toast('Study goal saved');
    });

    root.querySelector('#add-habit').addEventListener('click', () => openHabitEditor(store, null, draw));
    root.querySelectorAll('[data-edit-habit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const h = store.get().habits.find((h) => h.id === btn.getAttribute('data-edit-habit'));
        openHabitEditor(store, h, draw);
      });
    });
    root.querySelectorAll('[data-toggle-active]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-toggle-active');
        store.update((s) => { const h = s.habits.find((h) => h.id === id); if (h) h.active = cb.checked; });
        draw();
      });
    });
    root.querySelectorAll('[data-delete-habit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirmDialog('Delete this habit permanently? Its past logs will remain in your data but it will disappear from every list.')) return;
        const id = btn.getAttribute('data-delete-habit');
        store.update((s) => { s.habits = s.habits.filter((h) => h.id !== id); });
        draw();
      });
    });

    root.querySelector('#add-preset').addEventListener('click', () => openPresetEditor(store, null, draw));
    root.querySelectorAll('[data-edit-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = store.get().timerPresets.find((p) => p.id === btn.getAttribute('data-edit-preset'));
        openPresetEditor(store, p, draw);
      });
    });
    root.querySelectorAll('[data-delete-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirmDialog('Delete this preset?')) return;
        const id = btn.getAttribute('data-delete-preset');
        store.update((s) => { s.timerPresets = s.timerPresets.filter((p) => p.id !== id); });
        draw();
      });
    });

    root.querySelector('#export-data').addEventListener('click', () => {
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `glowup-backup-${todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Exported ✓');
    });

    const fileInput = root.querySelector('#import-data');
    root.querySelector('#import-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      fileInput.value = ''; // so choosing the same file again still fires 'change'
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) { toast('That file is too large to be a Glow-Up OS backup.', 'error'); return; }
      const reader = new FileReader();
      reader.onerror = () => toast('Could not read that file.', 'error');
      reader.onload = () => {
        try {
          store.validateImport(reader.result); // throws on bad files, before anything changes
        } catch (err) {
          console.warn('[glowup] import rejected:', err.message);
          toast(`Import failed — ${err.message || 'invalid file'}`, 'error');
          return;
        }
        if (!confirmDialog('Importing will REPLACE the data currently in this browser with the contents of this file. A copy of your current data is kept so you can undo it. Continue?')) return;
        try {
          store.importJSON(reader.result);
          applyTheme(store.get().settings.theme);
          toast('Data imported ✓');
          draw();
        } catch (err) {
          console.error('[glowup] import failed', err);
          toast(`Import failed — ${err.message || 'invalid file'}`, 'error');
        }
      };
      reader.readAsText(file);
    });

    const restoreBtn = root.querySelector('#restore-backup');
    if (restoreBtn) restoreBtn.addEventListener('click', () => {
      if (!confirmDialog('Replace the current data with the copy saved before your last import/reset?')) return;
      try { store.restoreBackup(); applyTheme(store.get().settings.theme); toast('Previous data restored ✓'); draw(); }
      catch (err) { toast(err.message || 'Could not restore', 'error'); }
    });

    root.querySelector('#reset-data').addEventListener('click', () => {
      if (!confirmDialog('This will permanently erase ALL your data in this browser. Consider exporting first. Continue?')) return;
      if (!confirmDialog('Are you absolutely sure? This cannot be undone.')) return;
      store.reset();
      applyTheme(store.get().settings.theme);
      toast('All data reset (a copy was kept — see Restore below)');
      draw();
    });
  }

  draw();
}

function renderHabitList(state) {
  if (!state.habits.length) return '<p class="empty-state">No habits defined.</p>';
  return state.habits.map((h) => {
    const cat = CATEGORIES.find((c) => c.id === h.categoryId);
    return `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(h.label)}</strong>
        <div class="muted small">${cat ? cat.icon + ' ' + cat.label : h.categoryId} · ${h.type === 'time' ? 'Time-based' : 'Yes/No'}</div>
      </div>
      <div class="list-item-actions">
        <label class="inline-check"><input type="checkbox" data-toggle-active="${h.id}" ${h.active ? 'checked' : ''} aria-label="Active: ${escapeHtml(h.label)}"/> Active</label>
        <button class="btn btn-sm btn-ghost" data-edit-habit="${h.id}">Edit</button>
        <button class="btn btn-sm btn-ghost" data-delete-habit="${h.id}">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function renderPresetList(state) {
  if (!state.timerPresets.length) return '<p class="empty-state">No presets — add one, or rely on "Custom" on the Focus Timer page.</p>';
  return state.timerPresets.map((p) => `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(p.label)}</strong>
        <div class="muted small">${p.focusMin}m focus${p.breakMin ? ' · ' + p.breakMin + 'm break' : ''}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-sm btn-ghost" data-edit-preset="${p.id}">Edit</button>
        <button class="btn btn-sm btn-ghost" data-delete-preset="${p.id}">Delete</button>
      </div>
    </div>
  `).join('');
}

function openPresetEditor(store, preset, onDone) {
  const isNew = !preset;
  const draft = preset ? { ...preset } : { id: uid('preset'), label: '', focusMin: 25, breakMin: 5 };

  const overlay = openModal(`
    <h3>${isNew ? 'New timer preset' : 'Edit timer preset'}</h3>
    <label for="p-label">Label</label>
    <input class="input" id="p-label" placeholder="e.g. 40 / 8" />
    <label for="p-focus">Focus minutes</label>
    <input class="input" id="p-focus" type="number" inputmode="numeric" min="1" />
    <label for="p-break">Break minutes (0 for none)</label>
    <input class="input" id="p-break" type="number" inputmode="numeric" min="0" />
    <div class="modal-actions">
      <button class="btn btn-ghost" id="p-cancel">Cancel</button>
      <button class="btn btn-primary" id="p-save">Save</button>
    </div>
  `);

  overlay.querySelector('#p-label').value = draft.label;
  overlay.querySelector('#p-focus').value = draft.focusMin;
  overlay.querySelector('#p-break').value = draft.breakMin;

  overlay.querySelector('#p-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#p-save').addEventListener('click', () => {
    const label = overlay.querySelector('#p-label').value.trim();
    if (!label) { toast('Please enter a label', 'error'); return; }
    draft.label = label;
    draft.focusMin = toPositiveInt(overlay.querySelector('#p-focus').value, 25);
    draft.breakMin = Math.max(0, Math.round(+overlay.querySelector('#p-break').value) || 0);
    store.update((s) => {
      const idx = s.timerPresets.findIndex((p) => p.id === draft.id);
      if (idx >= 0) s.timerPresets[idx] = draft; else s.timerPresets.push(draft);
    });
    overlay.remove();
    onDone();
  });
}

function openHabitEditor(store, habit, onDone) {
  const isNew = !habit;
  const draft = habit ? { ...habit } : { id: uid('h'), categoryId: CATEGORIES[0].id, label: '', type: 'boolean', active: true };

  const overlay = openModal(`
    <h3>${isNew ? 'New habit' : 'Edit habit'}</h3>
    <label for="h-label">Label</label>
    <input class="input" id="h-label" placeholder="e.g. Meditate" />
    <label for="h-category">Category</label>
    <select class="input" id="h-category">${CATEGORIES.map((c) => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('')}</select>
    <label for="h-type">Type</label>
    <select class="input" id="h-type">
      <option value="boolean">Yes / No</option>
      <option value="time">Time (minutes)</option>
    </select>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="h-cancel">Cancel</button>
      <button class="btn btn-primary" id="h-save">Save</button>
    </div>
  `);

  overlay.querySelector('#h-label').value = draft.label;
  overlay.querySelector('#h-category').value = draft.categoryId;
  overlay.querySelector('#h-type').value = draft.type;

  overlay.querySelector('#h-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#h-save').addEventListener('click', () => {
    const label = overlay.querySelector('#h-label').value.trim();
    if (!label) { toast('Please enter a label', 'error'); return; }
    draft.label = label;
    draft.categoryId = overlay.querySelector('#h-category').value;
    draft.type = overlay.querySelector('#h-type').value;
    store.update((s) => {
      const idx = s.habits.findIndex((h) => h.id === draft.id);
      if (idx >= 0) s.habits[idx] = { ...s.habits[idx], ...draft }; else s.habits.push(draft);
    });
    overlay.remove();
    onDone();
  });
}
