import { uid, last7Days, escapeHtml, minutesToLabel, toPositiveInt, formatDateShort } from './utils.js';
import { card, toast, openModal, confirmDialog } from './components.js';
import { getSession, startSession, pauseSession, resumeSession, getElapsedSeconds, endSession } from './focusEngine.js';
import { logStudyMinutes } from './study.js';

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function renderFocusTimer(root, store) {
  // Setup-form values live here (not in the DOM) so switching a preset chip
  // doesn't wipe the subject / task the person already picked or typed.
  let selectedPresetId = store.get().timerPresets[0]?.id || 'custom';
  let customMinutes = 25;
  let selectedSubjectId = '';
  let taskText = '';
  let tickInterval = null;
  let timeUpAnnounced = false;

  function draw() {
    const state = store.get();
    const session = getSession();
    if (session) drawActive(state, session);
    else drawSetup(state);
  }

  function drawSetup(state) {
    document.title = 'Focus Timer · Glow-Up OS';
    const week = last7Days();
    const allSessions = state.focusSessions || [];
    const weekMinutes = allSessions.filter((s) => week.includes(s.date)).reduce((a, s) => a + (s.actualMinutes || 0), 0);
    const totalMinutes = allSessions.reduce((a, s) => a + (s.actualMinutes || 0), 0);
    const completedCount = allSessions.filter((s) => s.status === 'completed').length;
    if (selectedPresetId !== 'custom' && !state.timerPresets.some((p) => p.id === selectedPresetId)) {
      selectedPresetId = state.timerPresets[0]?.id || 'custom';
    }
    if (selectedSubjectId && !state.subjects.some((s) => s.id === selectedSubjectId)) selectedSubjectId = '';

    root.innerHTML = `
      <div class="page">
        <header class="page-header"><h1>⏱ Focus Timer</h1></header>

        ${card(`
          <h3>Start a session</h3>
          <label id="dur-label">Duration</label>
          <div class="chip-remove" id="preset-chips" role="group" aria-labelledby="dur-label">
            ${state.timerPresets.map((p) => `<button type="button" class="chip ${p.id === selectedPresetId ? 'active' : ''}" aria-pressed="${p.id === selectedPresetId}" data-preset="${p.id}">${escapeHtml(p.label)}</button>`).join('')}
            <button type="button" class="chip ${selectedPresetId === 'custom' ? 'active' : ''}" aria-pressed="${selectedPresetId === 'custom'}" data-preset="custom">Custom</button>
          </div>
          <div id="custom-minutes-wrap" style="${selectedPresetId === 'custom' ? '' : 'display:none'};margin-top:10px">
            <label for="custom-minutes">Custom duration (minutes)</label>
            <input class="input" id="custom-minutes" type="number" inputmode="numeric" min="1" value="${customMinutes}" />
          </div>

          <label for="focus-subject" style="margin-top:10px">Subject (optional)</label>
          <select class="input" id="focus-subject">
            <option value="">No subject / general focus</option>
            ${state.subjects.map((s) => `<option value="${s.id}" ${s.id === selectedSubjectId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
          </select>

          <label for="focus-task">Task (optional)</label>
          <input class="input" id="focus-task" placeholder="What are you working on?" value="${escapeHtml(taskText)}" />

          <button class="btn btn-primary btn-block btn-lg" id="start-session">▶ Start focus session</button>
        `)}

        <div class="grid grid-3">
          ${card(`<div class="stat-big">${minutesToLabel(totalMinutes)}</div><div class="stat-label">Total focus time</div>`)}
          ${card(`<div class="stat-big">${minutesToLabel(weekMinutes)}</div><div class="stat-label">This week</div>`)}
          ${card(`<div class="stat-big">${completedCount}</div><div class="stat-label">Sessions completed</div>`)}
        </div>

        ${card(`
          <h3>Recent sessions</h3>
          <div class="list">${renderHistory(state)}</div>
        `)}
      </div>
    `;

    const captureForm = () => {
      selectedSubjectId = root.querySelector('#focus-subject').value;
      taskText = root.querySelector('#focus-task').value;
    };

    root.querySelectorAll('[data-preset]').forEach((chip) => {
      chip.addEventListener('click', () => {
        captureForm();
        selectedPresetId = chip.getAttribute('data-preset');
        drawSetup(store.get());
      });
    });
    const customInput = root.querySelector('#custom-minutes');
    if (customInput) customInput.addEventListener('input', (e) => { customMinutes = toPositiveInt(e.target.value, 1); });

    root.querySelector('#start-session').addEventListener('click', () => {
      captureForm();
      let plannedMinutes, presetLabel;
      if (selectedPresetId === 'custom') {
        plannedMinutes = toPositiveInt(root.querySelector('#custom-minutes').value, 0);
        if (!plannedMinutes) { toast('Enter a duration in minutes', 'error'); return; }
        presetLabel = `Custom (${plannedMinutes}m)`;
      } else {
        const preset = store.get().timerPresets.find((p) => p.id === selectedPresetId);
        plannedMinutes = preset ? preset.focusMin : 25;
        presetLabel = preset ? preset.label : 'Custom';
      }
      timeUpAnnounced = false;
      startSession({ subjectId: selectedSubjectId, task: taskText.trim(), presetLabel, plannedMinutes });
      draw();
    });
  }

  function clockParts() {
    const session = getSession();
    const remaining = session.plannedSeconds - getElapsedSeconds();
    const overrun = remaining <= 0;
    return {
      overrun,
      text: overrun ? '+' + formatClock(-remaining) : formatClock(remaining),
      caption: overrun ? "Time's up — finish up or end whenever you're ready" : (session.paused ? 'paused' : 'remaining'),
    };
  }

  function drawActive(state, session) {
    const subject = state.subjects.find((s) => s.id === session.subjectId);
    const c = clockParts();

    root.innerHTML = `
      <div class="page">
        <header class="page-header"><h1>⏱ Focus Timer</h1></header>

        ${card(`
          <div class="timer-display">
            <div class="timer-clock ${c.overrun ? 'timer-overrun' : ''}" id="timer-clock" role="timer" aria-live="off">${c.text}</div>
            <div class="muted" id="timer-caption">${c.caption}</div>
          </div>
          <hr class="sep" />
          <div class="grid grid-2">
            <div><div class="stat-label">Subject</div><div>${subject ? escapeHtml(subject.name) : 'General focus'}</div></div>
            <div><div class="stat-label">Task</div><div>${session.task ? escapeHtml(session.task) : '—'}</div></div>
          </div>
          <div class="quick-actions timer-actions">
            <button class="btn btn-lg" id="pause-resume">${session.paused ? '▶ Resume' : '⏸ Pause'}</button>
            <button class="btn btn-danger btn-lg" id="end-session">■ End session</button>
          </div>
        `)}
      </div>
    `;

    root.querySelector('#pause-resume').addEventListener('click', () => {
      if (getSession().paused) resumeSession(); else pauseSession();
      draw();
    });
    root.querySelector('#end-session').addEventListener('click', () => {
      const live = getSession();
      if (!live) { draw(); return; }
      const wasRunning = !live.paused;
      if (wasRunning) pauseSession();
      const completed = getElapsedSeconds() >= live.plannedSeconds - 1;
      if (!completed && !confirmDialog('End this session early? It will be logged as interrupted.')) {
        if (wasRunning) resumeSession();
        draw();
        return;
      }
      finishSession();
    });
  }

  /** Cheap once-a-second update: touch only the clock text, never rebuild the page. */
  function tick() {
    const session = getSession();
    if (!session) return;
    const clock = root.querySelector('#timer-clock');
    if (!clock) { draw(); return; } // e.g. session restored while the setup form was showing
    const c = clockParts();
    clock.textContent = c.text;
    clock.classList.toggle('timer-overrun', c.overrun);
    const cap = root.querySelector('#timer-caption');
    if (cap) cap.textContent = c.caption;
    document.title = `${c.text} · Focus · Glow-Up OS`;
    if (c.overrun && !timeUpAnnounced && !session.paused) {
      timeUpAnnounced = true;
      toast("⏰ Time's up — nice focus!");
      try { navigator.vibrate?.([200, 100, 200]); } catch (e) { /* not supported */ }
    }
  }

  function finishSession() {
    const snap = endSession();
    if (!snap) { draw(); return; }
    const actualMinutes = Math.max(0, Math.round(snap.elapsedSeconds / 60));
    const completed = snap.elapsedSeconds >= snap.plannedSeconds - 1;

    // Save immediately — the reflection is an optional extra applied afterwards,
    // so closing/dismissing the dialog can never lose a finished session.
    const record = {
      id: uid('fs'),
      date: snap.date,
      subjectId: snap.subjectId,
      task: snap.task,
      presetLabel: snap.presetLabel,
      plannedMinutes: Math.round(snap.plannedSeconds / 60),
      actualMinutes,
      status: completed ? 'completed' : 'interrupted',
      reflection: '',
    };
    store.update((s) => { s.focusSessions.push(record); });
    if (actualMinutes > 0) logStudyMinutes(store, { subjectId: snap.subjectId, minutes: actualMinutes, date: snap.date });
    toast(completed ? 'Nice work — session logged 🎉' : 'Session logged');
    taskText = '';
    draw();
    openSummaryModal(record);
  }

  function openSummaryModal(record) {
    const state = store.get();
    const subject = state.subjects.find((s) => s.id === record.subjectId);
    const completed = record.status === 'completed';
    const overlay = openModal(`
      <h3>${completed ? '✅ Session complete' : 'Session ended'}</h3>
      <p class="muted">Saved · ${minutesToLabel(record.actualMinutes)} · ${subject ? escapeHtml(subject.name) : 'General focus'}${record.task ? ' · ' + escapeHtml(record.task) : ''}</p>
      <label for="reflection">Optional reflection</label>
      <textarea class="input" id="reflection" rows="3" placeholder="How did it go?"></textarea>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="skip-summary">Skip</button>
        <button class="btn btn-primary" id="save-summary">Save reflection</button>
      </div>
    `);
    overlay.querySelector('#skip-summary').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#save-summary').addEventListener('click', () => {
      const reflection = overlay.querySelector('#reflection').value.trim();
      if (reflection) {
        store.update((s) => { const r = s.focusSessions.find((x) => x.id === record.id); if (r) r.reflection = reflection; });
        toast('Reflection saved');
      }
      overlay.remove();
      if (!getSession()) draw();
    });
  }

  function renderHistory(state) {
    const sessions = [...(state.focusSessions || [])].reverse().slice(0, 12);
    if (!sessions.length) return '<p class="empty-state">No sessions yet — start your first one above.</p>';
    return sessions.map((s) => {
      const subject = state.subjects.find((sub) => sub.id === s.subjectId);
      return `
        <div class="list-item">
          <div>
            <strong>${escapeHtml(formatDateShort(s.date))}</strong> · ${minutesToLabel(s.actualMinutes)} <span aria-label="${s.status === 'completed' ? 'completed' : 'ended early'}">${s.status === 'completed' ? '✅' : '⏸'}</span>
            <div class="muted small">${subject ? escapeHtml(subject.name) : 'General focus'}${s.task ? ' · ' + escapeHtml(s.task) : ''}</div>
            ${s.reflection ? `<div class="muted small">${escapeHtml(s.reflection)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  draw();
  // Live clock: cheap text update once a second, only while a session exists.
  // Cleared on route change (see router.js cleanup support).
  tickInterval = setInterval(tick, 1000);

  return () => {
    if (tickInterval) clearInterval(tickInterval);
  };
}
