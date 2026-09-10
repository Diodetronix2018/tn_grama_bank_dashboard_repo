/* Intrusion Status: current arm/alarm/fault/tamper state, plus incidents
   that already cleared earlier today. Every counter opens the list behind it. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var W = App.widgets;
  var u = App.utils;
  var COLORS = u.COLORS;

  var LIVE_FILTERS = {
    armed: { title: "Armed Branches", match: function (b) { return b.panelStatus === "Armed"; } },
    disarmed: { title: "Disarmed Branches", match: function (b) { return b.panelStatus === "Disarmed"; } },
    alarm: { title: "Alarm Active Branches", match: function (b) { return b.panelStatus === "Alarm Active"; } },
    fault: { title: "Fault Branches", match: function (b) { return b.panelStatus === "Fault"; } },
  };

  function openBranch(ctx, branch) {
    ctx.setState({ selectedRegion: branch.district, selectedBranchId: branch.id });
    ctx.go("overview");
  }

  function livePanel(ctx) {
    var key = ctx.state.liveStatusFilter;
    if (!key) return null;

    if (key === "tamper") {
      var tampered = App.data.tamperBranches();
      return W.filterPanel({
        title: "Tamper Active Branches",
        count: tampered.length,
        subtitle: "Zones reporting an open tamper switch right now",
        rows: tampered,
        columns: [
          { label: "Branch", className: "name", render: function (r) { return r.branch.name; } },
          { label: "District", className: "sub", render: function (r) { return r.branch.district; } },
          { label: "Zone", className: "sub", render: function (r) { return r.zone; } },
          { label: "Since", className: "mono", render: function (r) { return r.time; } },
        ],
        onRowClick: function (r) { openBranch(ctx, r.branch); },
        onClose: function () { ctx.setState({ liveStatusFilter: null }); },
      });
    }

    var meta = LIVE_FILTERS[key];
    if (!meta) return null;
    var rows = App.data.allBranches().filter(meta.match);
    return W.filterPanel({
      title: meta.title,
      count: rows.length,
      subtitle: "Click a row to open that branch",
      rows: rows.slice(0, 120),
      columns: [
        { label: "Branch", key: "name", className: "name" },
        { label: "District", key: "district", className: "sub" },
        { label: "Panel Status", render: function (b) { return W.panelBadge(b.panelStatus); } },
        { label: "Connectivity", render: function (b) { return W.connBadge(b.connectivity); } },
      ],
      onRowClick: function (b) { openBranch(ctx, b); },
      onClose: function () { ctx.setState({ liveStatusFilter: null }); },
    });
  }

  function restoredPanel(ctx) {
    var key = ctx.state.restoreFilter;
    if (!key) return null;
    var titles = { alarm: "Alarm Restored", fault: "Fault Restored", tamper: "Tamper Restored" };
    var rows = App.data.restoredEvents()[key];

    return W.filterPanel({
      title: titles[key],
      count: rows.length,
      subtitle: "Earlier-today incidents that have already cleared · click a row to open that branch",
      rows: rows,
      columns: [
        { label: "Branch", className: "name", render: function (r) { return r.branch.name; } },
        { label: "District", className: "sub", render: function (r) { return r.branch.district; } },
        { label: "Zone", className: "sub", render: function (r) { return r.zone; } },
        {
          label: "Restored At",
          render: function (r) {
            return h("span.mono", { style: "color:" + COLORS.green + ";" }, r.time);
          },
        },
      ],
      onRowClick: function (r) { openBranch(ctx, r.branch); },
      onClose: function () { ctx.setState({ restoreFilter: null }); },
    });
  }

  /* Branches whose panel is currently in a condition an operator must act on. */
  function openIncidents() {
    var rows = App.data.allBranches()
      .filter(function (b) {
        return b.panelStatus === "Alarm Active" || b.panelStatus === "Fault";
      })
      .map(function (b) {
        var zoneEvent = (b.events || []).find(function (e) { return e.zone; });
        return {
          branch: b,
          name: b.name,
          district: b.district,
          panelStatus: b.panelStatus,
          zone: zoneEvent ? zoneEvent.zone : "--",
          since: zoneEvent ? zoneEvent.time : "--",
        };
      });

    App.data.tamperBranches().forEach(function (t) {
      rows.push({
        branch: t.branch,
        name: t.branch.name,
        district: t.branch.district,
        panelStatus: "Tamper Active",
        zone: t.zone,
        since: t.time,
      });
    });

    return rows.sort(function (a, b) { return a.since < b.since ? 1 : -1; });
  }

  function render(ctx) {
    var stats = App.data.networkStats();
    var restored = App.data.restoredEvents();
    var tamperActive = App.data.tamperBranches().length;

    var cardDefs = [
      { key: "armed", kind: "live", label: "Armed", value: stats.armed, color: COLORS.navy, iconHtml: App.ICONS.lockClosed },
      { key: "disarmed", kind: "live", label: "Disarmed", value: stats.disarmed, color: COLORS.grey, iconHtml: App.ICONS.lockOpen },
      { key: "alarm", kind: "live", label: "Alarm Active", value: stats.alarm, color: COLORS.red, iconHtml: App.ICONS.alerts },
      { key: "alarm", kind: "restored", label: "Alarm Restored", value: restored.alarm.length, color: COLORS.green, iconHtml: App.ICONS.alerts },
      { key: "fault", kind: "live", label: "Fault", value: stats.fault, color: COLORS.amber, iconHtml: App.ICONS.fault },
      { key: "fault", kind: "restored", label: "Fault Restored", value: restored.fault.length, color: COLORS.green, iconHtml: App.ICONS.fault },
      { key: "tamper", kind: "live", label: "Tamper Active", value: tamperActive, color: COLORS.orange, iconHtml: App.ICONS.zones },
      { key: "tamper", kind: "restored", label: "Tamper Restored", value: restored.tamper.length, color: COLORS.green, iconHtml: App.ICONS.zones },
    ];

    var cards = cardDefs.map(function (d) {
      var isRestored = d.kind === "restored";
      var selected = isRestored
        ? ctx.state.restoreFilter === d.key
        : ctx.state.liveStatusFilter === d.key;
      return {
        compact: true,
        label: d.label,
        value: d.value,
        hint: "Click to verify",
        color: d.color,
        iconHtml: d.iconHtml,
        selected: selected,
        onClick: function () {
          if (isRestored) {
            ctx.setState({
              restoreFilter: selected ? null : d.key,
              liveStatusFilter: null,
            });
          } else {
            ctx.setState({
              liveStatusFilter: selected ? null : d.key,
              restoreFilter: null,
            });
          }
        },
      };
    });

    var incidents = openIncidents();

    return h(
      "div",
      h("div.mb-lg", W.kpiRow(cards, 4)),
      livePanel(ctx),
      restoredPanel(ctx),
      h(
        "div.card",
        { style: "overflow:hidden;" },
        h("div.card-head",
          h("div",
            h("div.card-title", "Branches Currently in Alarm / Fault / Tamper ",
              h("span.muted-count", "(" + incidents.length + ")")),
            h("div.card-sub", "Click a row to view the full branch detail"))),
        h("div.table-scroll", { style: "max-height:460px;" }, W.dataTable([
          { label: "Branch", key: "name", className: "name" },
          { label: "District", key: "district", className: "sub" },
          { label: "Status", render: function (r) { return W.panelBadge(r.panelStatus); } },
          { label: "Zone", key: "zone", className: "sub" },
          { label: "Since", key: "since", className: "mono" },
        ], incidents, {
          onRowClick: function (r) { openBranch(ctx, r.branch); },
        }))
      )
    );
  }

  App.views = App.views || {};
  App.views.intrusionStatus = {
    label: "Intrusion Status",
    icon: "intrusion",
    title: "Intrusion Status",
    subtitle: "Arm, alarm, fault and tamper state",
    render: render,
  };
})(window.App = window.App || {});
