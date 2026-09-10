/* Application shell: state, navigation, and the render loop.

   State is a single plain object. `setState` merges a patch and repaints the
   content region; nothing else in the app touches the DOM outside its own
   render function. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var u = App.utils;
  var COLORS = u.COLORS;

  /* Sidebar order. Each key must have a matching module in src/views. */
  var NAV_ORDER = [
    "overview", "branchMonitoring", "intrusionStatus", "zoneStatus", "powerStatus",
    "liveActivities", "eventHistory", "locationMaps", "managerDetails", "reports",
    "systemSetting",
  ];

  var state = {
    active: "overview",
    now: new Date(),

    /* Overview */
    regionSearch: "",
    selectedRegion: App.data.HOME_DISTRICT,
    selectedBranchId: null,
    kpiFilter: null,

    /* Branch monitoring */
    bmSearch: "",

    /* Intrusion */
    liveStatusFilter: null,
    restoreFilter: null,

    /* Zones */
    zoneSearch: "",
    zoneSelectedBranchId: null,
    zoneViewMode: "showcase",
    zonePickerMode: "district",
    zonePickerDistrict: null,

    /* Power */
    powerFilter: null,
    powerSearch: "",

    /* Live activities */
    liveActivityFilter: null,
    liveViewMode: "command",

    /* Event history */
    ehSearch: "",
    ehTypeFilter: null,

    /* Managers */
    mgrSearch: "",

    /* Reports */
    reportType: "daily",

    /* Settings */
    notifChannels: {
      critical: { email: true, sms: true },
      warning: { email: true, sms: false },
      info: { email: false, sms: false },
    },
    escalationThresholds: { alarm: 5, fault: 30, offline: 15 },
  };

  var refs = {};

  function setState(patch) {
    Object.assign(state, patch);
    render();
  }

  function go(key) {
    if (!App.views[key]) return;
    state.active = key;
    if (window.location.hash.slice(1) !== key) {
      window.history.replaceState(null, "", "#" + key);
    }
    render();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  var ctx = {
    get state() { return state; },
    setState: setState,
    go: go,
  };

  /* ---- Chrome ---------------------------------------------------------- */

  function buildSidebar() {
    var nav = h("nav.sidebar",
      h(
        "div.brand",
        h("span.brand-mark", { html: App.ICONS.shield }),
        h("div", { style: "min-width:0;" },
          h("div.brand-name", "TN GRAMA BANK"),
          h("div.brand-sub", "HEAD OFFICE, SALEM · SECURITY OPS"))
      ),
      h("div.nav-heading", "DASHBOARD")
    );

    refs.navButtons = {};
    NAV_ORDER.forEach(function (key) {
      var view = App.views[key];
      if (!view) return;
      var button = h(
        "button.nav-item",
        { type: "button", onclick: function () { go(key); } },
        h("span.nav-chip", { html: App.ICONS[view.icon] }),
        h("span.nav-label", view.label),
        h("span.nav-dot", { style: "visibility:hidden;" })
      );
      refs.navButtons[key] = button;
      nav.appendChild(button);
    });

    nav.appendChild(h("div.sidebar-note",
      "Structure follows the bank's security-ops mind map, cross-checked against " +
      "the Tamil Nadu district list. Sample data — point src/data at the real feed."));

    return nav;
  }

  function overallPill(stats) {
    if (stats.alarm > 0) {
      return { label: "ALERT — ALARM ACTIVE", bg: "#fdeeee", color: COLORS.red, border: "#f3c9c9" };
    }
    if (stats.fault > 0) {
      return { label: "WARNING — FAULT PRESENT", bg: "#fdf3e4", color: COLORS.amber, border: "#f0dcb3" };
    }
    return { label: "SECURE — ALL NORMAL", bg: "#e9f6ee", color: COLORS.green, border: "#bfe3cc" };
  }

  function buildTopbar() {
    refs.title = h("h1");
    refs.subtitle = h("div.topbar-sub");
    refs.clock = h("span", u.fmtClock(state.now));
    refs.pill = h("div.overall-pill");

    return h(
      "header.topbar",
      h("div", refs.title, refs.subtitle),
      h("div.topbar-right",
        h("div.clock", h("span.clock-dot"), refs.clock),
        refs.pill)
    );
  }

  /* ---- Render ---------------------------------------------------------- */

  /* Repainting the content region blows away focus, so remember which input
     the operator was typing in and restore it plus the caret afterwards. */
  function captureFocus() {
    var el = document.activeElement;
    if (!el || !el.id || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return null;
    return {
      id: el.id,
      start: el.selectionStart,
      end: el.selectionEnd,
    };
  }

  function restoreFocus(snapshot) {
    if (!snapshot) return;
    var el = document.getElementById(snapshot.id);
    if (!el) return;
    el.focus();
    if (el.setSelectionRange && snapshot.start !== null && el.type !== "range") {
      try { el.setSelectionRange(snapshot.start, snapshot.end); } catch (err) { /* type has no selection */ }
    }
  }

  function render() {
    var view = App.views[state.active] || App.views.overview;
    var stats = App.data.networkStats();
    var pill = overallPill(stats);
    var focus = captureFocus();

    refs.title.textContent = view.title;
    refs.subtitle.textContent = view.subtitle;
    refs.pill.textContent = pill.label;
    refs.pill.setAttribute(
      "style",
      "background:" + pill.bg + ";color:" + pill.color + ";border-color:" + pill.border + ";"
    );

    Object.keys(refs.navButtons).forEach(function (key) {
      var isActive = key === state.active;
      refs.navButtons[key].classList.toggle("is-active", isActive);
      refs.navButtons[key].lastChild.style.visibility = isActive ? "visible" : "hidden";
    });

    App.dom.clear(refs.content);
    refs.content.appendChild(view.render(ctx));
    restoreFocus(focus);
  }

  /* ---- Boot ------------------------------------------------------------ */

  function start() {
    var root = document.getElementById("app");
    refs.content = h("main.content");

    var main = h("div.main", buildTopbar(), refs.content);
    root.appendChild(h("div.shell", buildSidebar(), main));

    var hash = window.location.hash.slice(1);
    if (App.views[hash]) state.active = hash;

    window.addEventListener("hashchange", function () {
      var key = window.location.hash.slice(1);
      if (App.views[key] && key !== state.active) {
        state.active = key;
        render();
      }
    });

    /* The header clock is the only thing that ticks; repainting the whole
       content region every second would fight with scrolling and typing. */
    setInterval(function () {
      state.now = new Date();
      refs.clock.textContent = u.fmtClock(state.now);
    }, 1000);

    render();
  }

  App.start = start;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window.App = window.App || {});
