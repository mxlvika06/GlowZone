import { Store } from './store.js';
import { defaultState } from './schema.js';
import { registerRoute, startRouter, navigate, rerender, currentPath } from './router.js';
import { toast, isModalOpen } from './components.js';
import { todayStr } from './utils.js';
import { applyTheme } from './theme.js';

import { renderDashboard } from './dashboard.js';
import { renderFitness } from './fitness.js';
import { renderBadminton } from './badminton.js';
import { renderSkincare } from './skincare.js';
import { renderHaircare } from './haircare.js';
import { renderPosture } from './posture.js';
import { renderSocial } from './social.js';
import { renderStudy } from './study.js';
import { renderFocusTimer } from './focusTimer.js';
import { renderSettings } from './settings.js';

const store = new Store(defaultState);
window.__glowupStore = store; // handy for debugging in devtools

// ---- Theme ----
applyTheme(store.get().settings.theme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (store.get().settings.theme === 'system') applyTheme('system');
});
document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = store.get().settings.theme;
  const isDarkNow = current === 'dark' || (current === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const next = isDarkNow ? 'light' : 'dark';
  store.update((s) => { s.settings.theme = next; });
  applyTheme(next);
  if (currentPath() === '/settings') rerender(); // keep the Settings dropdown in sync
});

// ---- Data safety hooks ----
store.onSaveError = () => toast('Could not save — browser storage is full or blocked. Export a backup from Settings.', 'error');
store.onExternalChange = () => { if (!isModalOpen()) rerender(); }; // another tab changed the data

// ---- Day rollover: if the app stays open past midnight (or a phone tab is
// resumed the next day), pages must re-render so "today" is really today.
let shownDate = todayStr();
function checkDayChange() {
  const now = todayStr();
  if (now !== shownDate) {
    shownDate = now;
    if (!isModalOpen()) rerender();
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayChange(); });
window.addEventListener('focus', checkDayChange);
window.addEventListener('pageshow', checkDayChange);
setInterval(checkDayChange, 60 * 1000);

// ---- Navigation ----
const NAV_ITEMS = [
  { route: '/', label: 'Dashboard', icon: '🏠' },
  { route: '/fitness', label: 'Fitness', icon: '🏃' },
  { route: '/badminton', label: 'Badminton', icon: '🏸' },
  { route: '/skincare', label: 'Skincare', icon: '🧴' },
  { route: '/haircare', label: 'Hair', icon: '💇' },
  { route: '/posture', label: 'Posture', icon: '🧍' },
  { route: '/social', label: 'Social', icon: '🗣️' },
  { route: '/study', label: 'Study', icon: '📚' },
  { route: '/focus', label: 'Focus', icon: '⏱' },
  { route: '/settings', label: 'Settings', icon: '⚙️' },
];

function buildNav(container) {
  container.innerHTML = NAV_ITEMS.map((item) => `
    <button type="button" class="nav-link" data-route="${item.route}">
      <span class="nav-icon" aria-hidden="true">${item.icon}</span><span class="nav-text">${item.label}</span>
    </button>
  `).join('');
  container.querySelectorAll('.nav-link').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.getAttribute('data-route')));
  });
}
buildNav(document.getElementById('nav-links'));
buildNav(document.getElementById('bottom-nav'));

// ---- Routes ----
registerRoute('/', renderDashboard, 'Dashboard');
registerRoute('/fitness', renderFitness, 'Fitness');
registerRoute('/badminton', renderBadminton, 'Badminton');
registerRoute('/skincare', renderSkincare, 'Skincare');
registerRoute('/haircare', renderHaircare, 'Hair care');
registerRoute('/posture', renderPosture, 'Posture');
registerRoute('/social', renderSocial, 'Social');
registerRoute('/study', renderStudy, 'Study');
registerRoute('/focus', renderFocusTimer, 'Focus Timer');
registerRoute('/settings', renderSettings, 'Settings');

startRouter(document.getElementById('main-content'), store);

// ---- Service worker (offline / installable) ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[glowup] service worker registration failed', err);
    });
  });
}
