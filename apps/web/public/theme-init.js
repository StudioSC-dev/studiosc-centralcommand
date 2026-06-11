// Apply the saved/system theme before paint to avoid a flash of the wrong
// palette. Kept as an external file (not inline) so the Content-Security-Policy
// can use a strict `script-src 'self'` with no inline-script allowance.
// Loaded synchronously in <head>, so it runs before first paint.
(function () {
  try {
    var s = localStorage.getItem("cc-theme");
    var t =
      s === "light" || s === "dark"
        ? s
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = t;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
