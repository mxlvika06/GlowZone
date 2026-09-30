// Applies the chosen theme and keeps the toggle icon + browser UI color in sync.
export function applyTheme(theme) {
  theme = ['light', 'dark', 'system'].includes(theme) ? theme : 'system';
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = isDark ? '☀️' : '🌙';
    toggleBtn.title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  }
  // An explicit choice overrides the OS-based <meta theme-color> pair so the
  // phone's status bar matches the app; "system" restores the media-query pair.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const add = (content, media) => {
    const m = document.createElement('meta');
    m.name = 'theme-color'; m.content = content;
    if (media) m.media = media;
    document.head.appendChild(m);
  };
  if (theme === 'system') { add('#6250e0', '(prefers-color-scheme: light)'); add('#0f0e1a', '(prefers-color-scheme: dark)'); }
  else add(isDark ? '#0f0e1a' : '#6250e0');
}
