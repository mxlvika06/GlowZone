// Small, framework-free UI helpers. The app renders by producing HTML
// strings per section and wiring event listeners after insertion — no
// virtual DOM needed at this scale, which keeps the codebase easy to read
// and modify without build tooling.

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function card(innerHTML, extraClass = '') {
  return `<div class="card ${extraClass}">${innerHTML}</div>`;
}

export function progressBar(percent, label = 'Progress') {
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  return `<div class="progress-bar" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><div class="progress-bar-fill" style="width:${p}%"></div></div>`;
}

export function circularProgress(percent, size = 72, label = '') {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return `
  <div class="ring" style="width:${size}px;height:${size}px;" role="img" aria-label="${percent}% complete">
    <svg width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}"
        transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <div class="ring-label" aria-hidden="true">${label || percent + '%'}</div>
  </div>`;
}

/** Message is inserted as TEXT (never HTML), so user-controlled strings are safe. */
export function toast(msg, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = document.createElement('div');
  node.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
  node.textContent = msg;
  if (type === 'error') node.setAttribute('role', 'alert');
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, type === 'error' ? 4500 : 2600);
}

let openModalCount = 0;
export function isModalOpen() { return openModalCount > 0; }

/**
 * Modal helper. Pass innerHTML for the modal body; returns the overlay so
 * callers can wire buttons and call overlay.remove() as before.
 * Adds: dialog semantics, Escape to close, backdrop click to close, focus
 * moved into the dialog and restored afterwards, Tab kept inside, and
 * background scroll locked while open.
 * Options: { dismissable: false } disables Escape/backdrop close.
 */
export function openModal(innerHTML, { dismissable = true } = {}) {
  const previouslyFocused = document.activeElement;
  const overlay = el(`<div class="modal-overlay"><div class="modal" role="dialog" aria-modal="true" tabindex="-1">${innerHTML}</div></div>`);
  const dialog = overlay.querySelector('.modal');
  const heading = dialog.querySelector('h3, h2');
  if (heading) {
    heading.id = heading.id || `modal-title-${Date.now()}`;
    dialog.setAttribute('aria-labelledby', heading.id);
  }
  document.body.appendChild(overlay);
  openModalCount++;
  document.body.classList.add('modal-open');

  const originalRemove = overlay.remove.bind(overlay);
  let removed = false;
  overlay.remove = () => {
    if (removed) return;
    removed = true;
    document.removeEventListener('keydown', onKey, true);
    originalRemove();
    openModalCount = Math.max(0, openModalCount - 1);
    if (openModalCount === 0) document.body.classList.remove('modal-open');
    if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus?.();
  };

  const focusables = () => [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled && n.offsetParent !== null);

  function onKey(e) {
    if (e.key === 'Escape' && dismissable) { e.stopPropagation(); overlay.remove(); return; }
    if (e.key === 'Tab') {
      const items = focusables();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);

  overlay.addEventListener('mousedown', (e) => {
    // only a press that STARTS on the backdrop closes it (dragging a text
    // selection out of an input and releasing on the backdrop must not)
    overlay._downOnBackdrop = e.target === overlay;
  });
  overlay.addEventListener('click', (e) => {
    if (dismissable && e.target === overlay && overlay._downOnBackdrop) overlay.remove();
  });

  // Focus the first field (or the dialog) — but not on touch devices where
  // that would pop the keyboard over the form before the person has looked at it.
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const firstField = dialog.querySelector('input:not([type="hidden"]), select, textarea');
  (firstField && !coarse ? firstField : dialog).focus({ preventScroll: true });
  return overlay;
}

export function confirmDialog(message) {
  return window.confirm(message);
}

// ---- Autosave for free-text fields --------------------------------------
// Saves shortly after typing stops, immediately on blur, and when the page is
// being hidden/closed — so a note typed just before navigating away or
// closing the tab is not lost (the old code only saved on blur).
const pendingFlushes = new Set();
let pagehideBound = false;

export function autosave(inputEl, save, { delay = 400 } = {}) {
  let timer = null;
  let dirty = false;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (dirty) { dirty = false; save(inputEl.value); }
    if (!inputEl.isConnected && !dirty) pendingFlushes.delete(flush);
  };
  inputEl.addEventListener('input', () => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  });
  inputEl.addEventListener('blur', flush);
  // Pages re-render often; drop handlers whose field is gone and has nothing left to save,
  // otherwise every re-render would leave another stale closure (and detached DOM) behind.
  for (const f of pendingFlushes) if (f.stale?.()) pendingFlushes.delete(f);
  flush.stale = () => !inputEl.isConnected && !dirty && !timer;
  pendingFlushes.add(flush);
  if (!pagehideBound) {
    pagehideBound = true;
    const flushAll = () => pendingFlushes.forEach((f) => f());
    window.addEventListener('pagehide', flushAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); });
  }
  return flush;
}
