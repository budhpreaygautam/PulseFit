// Applies the theme before React mounts, so the page never flashes the wrong one: light unless the
// visitor picked dark with the toggle (ThemeContext.tsx follows the same rule).
// A static file rather than an inline script, so the Content Security Policy needs no 'unsafe-inline'.
(function () {
  try {
    var dark = localStorage.getItem('pulsefit_theme') === 'dark';
    var el = document.documentElement;
    el.classList.add(dark ? 'dark' : 'light');
    el.classList.remove(dark ? 'light' : 'dark');
    el.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
