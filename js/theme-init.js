/* 在首屏渲染前应用主题，避免刷新时闪白/闪黑。
   与 js/main.js 中的 THEME_KEY 保持一致。 */
(function () {
  var KEY = "ycamera-theme";
  var stored = null;

  try {
    stored = localStorage.getItem(KEY);
  } catch (error) {
    stored = null;
  }

  var prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  var theme =
    stored === "light" || stored === "dark"
      ? stored
      : prefersDark
        ? "dark"
        : "light";

  document.documentElement.setAttribute("data-theme", theme);

  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#0b0b0c" : "#f5f5f7");
  }
})();
