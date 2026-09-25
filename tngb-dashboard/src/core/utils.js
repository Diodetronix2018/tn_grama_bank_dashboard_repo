/* Shared primitives: colors, seeded RNG, badge styling, formatting. */
(function (App) {
  "use strict";

  var COLORS = {
    green: "#15803d",
    red: "#b91c1c",
    amber: "#b45309",
    navy: "#002172",
    grey: "#64748b",
    slate: "#475569",
    orange: "#ea580c",
  };

  /* Deterministic 32-bit PRNG. Same seed always yields the same dashboard,
     so screenshots, CSV exports and drill-downs stay reproducible. */
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Stable RNG keyed by a string, so a branch always gets the same detail. */
  function seededRnd(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return mulberry32(h);
  }

  function pick(rnd, list) {
    return list[Math.floor(rnd() * list.length)];
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function badgeStyle(color) {
    return (
      "background:" + color + "14;color:" + color + ";border-color:" + color + "33;"
    );
  }

  function panelStatusColor(status) {
    if (status === "Armed") return COLORS.navy;
    if (status === "Disarmed") return COLORS.grey;
    if (status === "Alarm Active") return COLORS.red;
    if (status === "Fault") return COLORS.amber;
    if (status === "Tamper Active") return COLORS.orange;
    if (status === "Offline") return COLORS.red;
    return COLORS.slate;
  }

  /* The palette is tuned for white cards; on the dark command-centre
     surfaces each colour swaps for a lighter tone of the same hue so text
     and icons stay readable (the Zone Status hero uses the same tones). */
  var ON_DARK = {};
  ON_DARK[COLORS.navy] = "#7b9bff";
  ON_DARK[COLORS.green] = "#4ade80";
  ON_DARK[COLORS.red] = "#f87171";
  ON_DARK[COLORS.amber] = "#fbbf24";
  ON_DARK[COLORS.orange] = "#fb923c";
  ON_DARK[COLORS.grey] = "#94a3b8";
  ON_DARK[COLORS.slate] = "#94a3b8";

  function onDark(color) {
    return ON_DARK[color] || color;
  }

  function connectivityColor(conn) {
    return conn === "Online" ? COLORS.green : COLORS.red;
  }

  function fmtClock(d) {
    return (
      pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds())
    );
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function includesCI(haystack, needle) {
    return String(haystack).toLowerCase().indexOf(needle) !== -1;
  }

  App.utils = {
    COLORS: COLORS,
    mulberry32: mulberry32,
    seededRnd: seededRnd,
    pick: pick,
    pad2: pad2,
    badgeStyle: badgeStyle,
    panelStatusColor: panelStatusColor,
    connectivityColor: connectivityColor,
    onDark: onDark,
    escapeHtml: escapeHtml,
    fmtClock: fmtClock,
    includesCI: includesCI,
  };
})(window.App = window.App || {});
