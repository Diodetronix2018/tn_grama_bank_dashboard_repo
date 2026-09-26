/* Display preferences chosen on the System Setting screen. They live in this
   browser's localStorage (per operator, per machine) and are applied to the
   page here, so every screen picks them up -- not just System Setting. */
(function (App) {
  "use strict";

  var STORAGE_KEY = "tngb.prefs";

  var DEFAULTS = {
    accent: "#002172",
    density: "comfortable",
    badgeStyle: "signal",
    fontScale: 100,
    liveView: "command",
    sidebarCollapsed: false,
    reduceMotion: false,
    clock: "24h",
    refreshMs: 5 * 60 * 1000,
    idleTimeoutMin: 30,
  };

  /* Keys limited to a fixed set of values; anything else found in storage
     (hand-edited, or left by an older build) falls back to the default. */
  var CHOICES = {
    badgeStyle: ["signal", "tag", "dot"],
    refreshMs: [30 * 1000, 60 * 1000, 2 * 60 * 1000, 5 * 60 * 1000, 10 * 60 * 1000, 15 * 60 * 1000],
    idleTimeoutMin: [5, 10, 15, 30],
  };

  var values = load();

  function load() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; } catch (e) { /* storage blocked */ }
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var ok = typeof saved[k] === typeof DEFAULTS[k] &&
        (!CHOICES[k] || CHOICES[k].indexOf(saved[k]) !== -1);
      out[k] = ok ? saved[k] : DEFAULTS[k];
    });
    return out;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* Returns false when the browser refused to store it (private window,
     blocked site data) -- the change still applies for this visit. */
  function set(key, value) {
    values[key] = value;
    apply();
    return persist();
  }

  /* Resets the given keys, or everything when called with none. */
  function reset(keys) {
    (keys || Object.keys(DEFAULTS)).forEach(function (k) { values[k] = DEFAULTS[k]; });
    apply();
    persist();
  }

  function apply() {
    var root = document.documentElement;
    root.style.setProperty("--navy", values.accent);
    root.style.setProperty("--ui-scale", String(values.fontScale / 100));
    root.classList.toggle("pref-compact", values.density === "compact");
    root.setAttribute("data-badge-style", values.badgeStyle);
    root.classList.toggle("pref-reduce-motion", values.reduceMotion);
    root.classList.toggle("pref-sidebar-collapsed", values.sidebarCollapsed);
  }

  function isDefault(keys) {
    return (keys || Object.keys(DEFAULTS)).every(function (k) { return values[k] === DEFAULTS[k]; });
  }

  /* Header clock in the operator's chosen style. Data timestamps stay 24-hour
     so exported reports sort and compare consistently. */
  function fmtClock(d) {
    if (values.clock !== "12h") return App.utils.fmtClock(d);
    var hours = d.getHours() % 12 || 12;
    return hours + ":" + App.utils.pad2(d.getMinutes()) + ":" + App.utils.pad2(d.getSeconds()) +
      (d.getHours() < 12 ? " AM" : " PM");
  }

  apply();

  App.prefs = {
    DEFAULTS: DEFAULTS,
    CHOICES: CHOICES,
    get: function (key) { return values[key]; },
    set: set,
    reset: reset,
    isDefault: isDefault,
    fmtClock: fmtClock,
  };
})(window.App = window.App || {});
