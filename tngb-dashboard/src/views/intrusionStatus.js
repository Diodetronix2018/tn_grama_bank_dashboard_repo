/* Intrusion Status: current arm/alarm/fault/tamper state. Every counter
   opens the list behind it. */
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
    fault: { title: "Fault Active Branches", match: function (b) { return b.panelStatus === "Fault"; } },
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

    return rows.sort(function (a, b) { return a.since < b.since ? 1 : a.since > b.since ? -1 : 0; });
  }

  function render(ctx) {
    var stats = App.data.networkStats();
    var tamperActive = App.data.tamperBranches().length;

    var cardDefs = [
      { key: "armed", label: "Armed", value: stats.armed, color: COLORS.navy, iconHtml: App.ICONS.arm },
      { key: "disarmed", label: "Disarmed", value: stats.disarmed, color: COLORS.grey, iconHtml: App.ICONS.disarm },
      { key: "alarm", label: "Alarm Active", value: stats.alarm, color: COLORS.red, iconHtml: App.ICONS.bell },
      { key: "fault", label: "Fault Active", value: stats.fault, color: COLORS.amber, iconHtml: App.ICONS.fault },
      { key: "tamper", label: "Tamper Active", value: tamperActive, color: COLORS.orange, iconHtml: App.ICONS.tamper },
    ];

    var cards = cardDefs.map(function (d) {
      var selected = ctx.state.liveStatusFilter === d.key;
      return {
        compact: true,
        label: d.label,
        value: d.value,
        hint: "Click to verify",
        color: d.color,
        iconHtml: d.iconHtml,
        selected: selected,
        onClick: function () {
          ctx.setState({ liveStatusFilter: selected ? null : d.key });
        },
      };
    });

    var incidents = openIncidents();

    return h(
      "div",
      h("div.mb-lg", W.kpiRow(cards, 5)),
      livePanel(ctx),
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
