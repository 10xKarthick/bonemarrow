// ── SYSTEM THEME ─────────────────────────────────────────────────
(function () {
  function applyTheme(val, save) {
    document.documentElement.setAttribute("data-theme", val);
    if (save) localStorage.setItem("bm-theme", val);
    var icon  = document.getElementById("theme-icon");
    var label = document.getElementById("theme-label");
    if (icon)  icon.textContent  = val === "dark" ? "☀️" : "🌙";
    if (label) label.textContent = val === "dark" ? "Light" : "Dark";
  }

  var current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current, false);

  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function (e) {
    if (!localStorage.getItem("bm-theme")) {
      applyTheme(e.matches ? "light" : "dark", false);
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next, true);
    });
  });
})();

// ── LANG SWITCHER ────────────────────────────────────────────────
(function () {
  function applyLang(lang) {
    localStorage.setItem("bm-lang", lang);

    document.querySelectorAll(".lang-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.lang === lang);
    });

    document.querySelectorAll(".code-pane").forEach(function (p) {
      p.classList.toggle("active", p.dataset.lang === lang);
    });

    document.querySelectorAll(".code-block").forEach(function (block) {
      var label = block.querySelector(".code-block-label");
      if (!label) return;
      var jsL = block.dataset.jsLabel || "app.js";
      var tsL = block.dataset.tsLabel || jsL.replace(".js", ".ts");
      label.textContent = lang === "ts" ? tsL : jsL;
    });

    document.dispatchEvent(new CustomEvent("bm-lang-changed", { detail: lang }));
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".lang-btn");
    if (btn) applyLang(btn.dataset.lang);
  });

  document.addEventListener("DOMContentLoaded", function () {
    applyLang(localStorage.getItem("bm-lang") || "js");
  });
})();