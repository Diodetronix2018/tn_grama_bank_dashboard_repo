/* System Setting: notification routing, escalation timers, the standard zone
   layout, and the role matrix. All four panels write straight to app state. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var W = App.widgets;

  var NOTIF_DEFS = [
    { key: "critical", label: "Critical (Alarm / Tamper)", desc: "Intrusion and tamper events" },
    { key: "warning", label: "Warning (Fault / Power)", desc: "AC fail, battery fail, panel fault" },
    { key: "info", label: "Informational (Arm / Disarm)", desc: "Routine open/close activity" },
  ];

  var THRESHOLD_DEFS = [
    { key: "alarm", label: "Alarm Active" },
    { key: "fault", label: "Fault Condition" },
    { key: "offline", label: "Panel Offline" },
  ];

  var ROLES = [
    { role: "Head Office Admin", view: true, ack: true, configure: true, export: true },
    { role: "Regional Manager", view: true, ack: true, configure: false, export: true },
    { role: "Branch Manager", view: true, ack: true, configure: false, export: false },
    { role: "Viewer", view: true, ack: false, configure: false, export: false },
  ];

  function toggle(isOn, onClick, caption) {
    return h(
      "button.toggle-cell",
      { type: "button", onclick: onClick, "aria-pressed": String(isOn) },
      h("span.toggle-cap", caption),
      h("span.toggle-track" + (isOn ? ".is-on" : ""), h("span.toggle-knob"))
    );
  }

  function notificationsCard(ctx) {
    var channels = ctx.state.notifChannels;
    return h(
      "div.card.card-pad",
      { style: "padding:20px 22px;" },
      h("div.card-title", { style: "margin-bottom:4px;" }, "Notification Channels"),
      h("div.card-sub", { style: "margin-bottom:16px;" },
        "Choose how each severity level reaches the ops team"),
      h("div.flex-col", { style: "gap:10px;" }, NOTIF_DEFS.map(function (d) {
        var row = channels[d.key];
        var flip = function (field) {
          return function () {
            var next = Object.assign({}, channels);
            next[d.key] = Object.assign({}, row);
            next[d.key][field] = !row[field];
            ctx.setState({ notifChannels: next });
          };
        };
        return h(
          "div.setting-row",
          h("div",
            h("div.setting-name", d.label),
            h("div.setting-desc", d.desc)),
          h("div.toggle-group",
            toggle(row.email, flip("email"), "Email"),
            toggle(row.sms, flip("sms"), "SMS"))
        );
      }))
    );
  }

  function thresholdsCard(ctx) {
    var thresholds = ctx.state.escalationThresholds;
    return h(
      "div.card",
      { style: "padding:20px 22px;" },
      h("div.card-title", { style: "margin-bottom:4px;" }, "Alert Escalation Thresholds"),
      h("div.card-sub", { style: "margin-bottom:16px;" },
        "Minutes before an unresolved condition escalates to the regional office"),
      h("div.flex-col", { style: "gap:16px;" }, THRESHOLD_DEFS.map(function (d) {
        return h(
          "div",
          h("div.threshold-head",
            h("span", d.label),
            h("span.threshold-value", thresholds[d.key] + " min")),
          h("input", {
            type: "range", min: 1, max: 60, value: thresholds[d.key],
            oninput: function (e) {
              var next = Object.assign({}, thresholds);
              next[d.key] = Number(e.target.value);
              ctx.setState({ escalationThresholds: next });
            },
          })
        );
      }))
    );
  }

  function zoneLabelsCard() {
    var total = App.data.networkStats().totalBranches;
    return h(
      "div.card",
      { style: "padding:20px 22px;" },
      h("div.card-title", { style: "margin-bottom:4px;" }, "Zone Labels"),
      h("div.card-sub", { style: "margin-bottom:16px;" },
        "Standard 8-zone layout applied across all " + total + " branches"),
      h("div.grid.grid-2", { style: "gap:8px;" }, App.data.ZONE_LABELS.map(function (label, i) {
        return h("div.zone-label-cell",
          h("span.zone-label-num", String(i + 1)),
          h("span.zone-label-text", label));
      }))
    );
  }

  function rolesCard() {
    var tick = function (allowed) {
      return h("span", {
        style: "color:" + (allowed ? "var(--green)" : "var(--ink-faint)") + ";font-weight:700;",
      }, allowed ? "✓" : "—");
    };
    return h(
      "div.card",
      { style: "overflow:hidden;" },
      h("div", { style: "padding:20px 22px 4px;" },
        h("div.card-title", { style: "margin-bottom:4px;" }, "Access & Roles"),
        h("div.card-sub", { style: "margin-bottom:12px;" }, "Who can see and act on what")),
      W.dataTable([
        { label: "Role", key: "role", className: "name" },
        { label: "View", align: "center", render: function (r) { return tick(r.view); } },
        { label: "Acknowledge", align: "center", render: function (r) { return tick(r.ack); } },
        { label: "Configure", align: "center", render: function (r) { return tick(r.configure); } },
        { label: "Export", align: "center", render: function (r) { return tick(r.export); } },
      ], ROLES)
    );
  }

  function render(ctx) {
    return h(
      "div.grid.grid-2",
      { style: "align-items:start;" },
      notificationsCard(ctx),
      thresholdsCard(ctx),
      zoneLabelsCard(),
      rolesCard()
    );
  }

  App.views = App.views || {};
  App.views.systemSetting = {
    label: "System Setting",
    icon: "settings",
    title: "System Setting",
    subtitle: "Branch, zone and alert configuration",
    render: render,
  };
})(window.App = window.App || {});
