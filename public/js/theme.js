/**
 * Theme bootstrap. Loaded as a classic script in <head> so the stored theme is
 * applied before first paint — the CSP forbids an inline version of this.
 * `auto` deliberately sets no attribute and lets prefers-color-scheme decide.
 */
(function () {
  try {
    var t = localStorage.getItem("mimo_tts_theme");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {
    /* storage blocked — fall back to the system preference */
  }
})();
