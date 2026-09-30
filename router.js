const routes = {};
const titles = {};

export function registerRoute(path, renderFn, title = '') {
  routes[path] = renderFn;
  titles[path] = title;
}

export function navigate(path) {
  if (window.location.hash.slice(1) === path) {
    // same route: just re-render (e.g. after a data change)
    renderCurrent();
  } else {
    window.location.hash = path;
  }
}

let rootEl = null;
let storeRef = null;
let currentCleanup = null;
let lastPath = null;

export function startRouter(root, store) {
  rootEl = root;
  storeRef = store;
  window.addEventListener('hashchange', renderCurrent);
  renderCurrent();
}

export function currentPath() {
  const raw = window.location.hash.slice(1) || '/';
  return routes[raw] ? raw : '/';
}

function renderCurrent() {
  const path = currentPath();
  const renderFn = routes[path];
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch (e) { console.error(e); }
  }
  currentCleanup = null;
  rootEl.innerHTML = '';
  const changedPage = path !== lastPath;
  if (changedPage) window.scrollTo(0, 0);
  lastPath = path;

  // Error boundary: a bug in one section must not blank the whole app or
  // stop the navigation from working.
  try {
    // A render function may optionally return a cleanup function (e.g. to
    // clear a setInterval used only for live UI updates).
    currentCleanup = renderFn(rootEl, storeRef) || null;
  } catch (e) {
    console.error('[glowup] page failed to render', path, e);
    rootEl.innerHTML = `
      <div class="page"><div class="card">
        <h3>Something went wrong on this page</h3>
        <p class="muted">Your data is safe. Try going back to the dashboard, or reload.</p>
        <div class="quick-actions">
          <a class="btn btn-primary" href="#/">Go to Dashboard</a>
          <button class="btn" onclick="location.reload()">Reload</button>
        </div>
      </div></div>`;
  }

  updateActiveNav(path);
  document.title = titles[path] ? `${titles[path]} · Glow-Up OS` : 'Glow-Up OS';
  // Move keyboard/screen-reader focus to the new page (without scrolling) on real navigation only.
  if (changedPage && rootEl) { rootEl.setAttribute('tabindex', '-1'); rootEl.focus({ preventScroll: true }); }
}

function updateActiveNav(path) {
  document.querySelectorAll('.nav-link').forEach((a) => {
    const active = a.getAttribute('data-route') === path;
    a.classList.toggle('active', active);
    if (active) {
      a.setAttribute('aria-current', 'page');
      // keep the active tab visible in the horizontally-scrolling mobile bar
      if (a.closest('.bottom-nav')) a.scrollIntoView({ block: 'nearest', inline: 'center' });
    } else a.removeAttribute('aria-current');
  });
}

export function rerender() {
  renderCurrent();
}
