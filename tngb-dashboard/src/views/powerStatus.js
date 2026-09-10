/* Power Status: AC mains and battery-backup health across the network. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var badge = App.dom.badge;
  var W = App.widgets;
  var u = App.utils;
  var COLORS = u.COLORS;

  var ROW_LIMIT = 400;

  var FILTERS = {
    acNormal: { title: "AC Power Normal", side: "ac", match: function (x) { return x.power.acStatus === "Normal"; } },
    acFail: { title: "AC Fail", side: "ac", match: function (x) { return x.power.acStatus === "Fail"; } },
    acRestored: { title: "AC Restored Today", side: "ac", restored: true, match: function (x) { return x.power.acRestoredToday; } },
    batteryNormal: { title: "Battery Normal", side: "battery", match: function (x) { return x.power.batteryStatus === "Normal"; } },
    batteryFail: { title: "Battery Fail", side: "battery", match: function (x) { return x.power.batteryStatus === "Fail"; } },
    batteryRestored: { title: "Battery Restored Today", side: "battery", restored: true, match: function (x) { return x.power.batteryRestoredToday; } },
  };

  function panel(ctx) {
    var key = ctx.state.powerFilter;
    if (!key || !FILTERS[key]) return null;
    var meta = FILTERS[key];
    var rows = App.data.powerRows().filter(meta.match);

    var columns = [
      { label: "Branch", className: "name", render: function (r) { return r.branch.name; } },
      { label: "District", className: "sub", render: function (r) { return r.branch.district; } },
    ];

    if (meta.side === "ac") {
      columns.push({
        label: "AC Status",
        render: function (r) { return badge(r.power.acStatus, r.power.acColor); },
      });
    } else {
      columns.push({
        label: "Battery",
        render: function (r) { return badge(r.power.batteryStatus, r.power.batteryColor); },
      });
      columns.push({
        label: "Voltage",
        align: "right",
        render: function (r) { return r.power.voltage.toFixed(1) + "V"; },
      });
      columns.push({
        label: "Charging",
        render: function (r) { return badge(r.power.chargingStatus, r.power.chargingColor); },
      });
    }

    if (meta.restored) {
      columns.push({
        label: "Restored At",
        render: function (r) {
          var at = r.power.acRestoredAt || r.power.batteryRestoredAt || "--";
          return h("span.mono", { style: "color:" + COLORS.green + ";" }, at);
        },
      });
    }

    return W.filterPanel({
      title: meta.title,
      count: rows.length,
      subtitle: "Click a row to open that branch",
      maxHeight: 460,
      rows: rows.slice(0, 200),
      columns: columns,
      onRowClick: function (r) {
        ctx.setState({ selectedRegion: r.branch.district, selectedBranchId: r.branch.id });
        ctx.go("overview");
      },
      onClose: function () { ctx.setState({ powerFilter: null }); },
    });
  }

  /* Shown when no counter is selected, so the page is useful on arrival. */
  function overviewTable(ctx, rows) {
    var search = (ctx.state.powerSearch || "").toLowerCase();
    var matches = rows.filter(function (r) {
      return !search || u.includesCI(r.branch.name, search) || u.includesCI(r.branch.district, search);
    });

    return h(
      "div.card",
      { style: "overflow:hidden;" },
      W.listHeader({
        iconHtml: App.ICONS.power,
        title: "Power Health by Branch",
        count: matches.length,
        subtitle: "Pick a counter above to narrow this down · click a row to open the branch",
        controls: W.searchInput({
          id: "power-search",
          value: ctx.state.powerSearch,
          placeholder: "Search branch or district…",
          width: "280px",
          onInput: function (v) { ctx.setState({ powerSearch: v }); },
        }),
      }),
      matches.length
        ? h("div.table-scroll", { style: "max-height:560px;" }, W.dataTable([
            { label: "Branch", className: "name", render: function (r) { return r.branch.name; } },
            { label: "District", className: "sub", render: function (r) { return r.branch.district; } },
            { label: "AC Status", render: function (r) { return badge(r.power.acStatus, r.power.acColor); } },
            { label: "Battery", render: function (r) { return badge(r.power.batteryStatus, r.power.batteryColor); } },
            {
              label: "Voltage", align: "right",
              render: function (r) { return r.power.voltage.toFixed(1) + "V"; },
            },
            {
              label: "Charging",
              render: function (r) { return badge(r.power.chargingStatus, r.power.chargingColor); },
            },
          ], matches.slice(0, ROW_LIMIT), {
            onRowClick: function (r) {
              ctx.setState({ selectedRegion: r.branch.district, selectedBranchId: r.branch.id });
              ctx.go("overview");
            },
          }))
        : h("div", { style: "padding:40px;text-align:center;color:var(--ink-soft);" },
            "No branch matches that search."),
      matches.length > ROW_LIMIT
        ? h("div", {
            style: "padding:12px 22px;border-top:1px solid var(--line-faint);" +
              "font-size:11.5px;color:var(--ink-faint);",
          }, "Showing the first " + ROW_LIMIT + " of " + matches.length + " branches.")
        : null
    );
  }

  function render(ctx) {
    var rows = App.data.powerRows();
    var count = function (fn) { return rows.filter(fn).length; };

    var cardDefs = [
      { key: "acNormal", label: "AC Power Normal", value: count(function (x) { return x.power.acStatus === "Normal"; }), color: COLORS.green, iconHtml: App.ICONS.power },
      { key: "acFail", label: "AC Fail", value: count(function (x) { return x.power.acStatus === "Fail"; }), color: COLORS.red, iconHtml: App.ICONS.power },
      { key: "acRestored", label: "AC Restored", value: count(function (x) { return x.power.acRestoredToday; }), color: COLORS.green, iconHtml: App.ICONS.power },
      { key: "batteryNormal", label: "Battery Normal", value: count(function (x) { return x.power.batteryStatus === "Normal"; }), color: COLORS.green, iconHtml: App.ICONS.battery },
      { key: "batteryFail", label: "Battery Fail", value: count(function (x) { return x.power.batteryStatus === "Fail"; }), color: COLORS.red, iconHtml: App.ICONS.battery },
      { key: "batteryRestored", label: "Battery Restored", value: count(function (x) { return x.power.batteryRestoredToday; }), color: COLORS.green, iconHtml: App.ICONS.battery },
    ];

    var cards = cardDefs.map(function (d) {
      return {
        compact: true,
        label: d.label,
        value: d.value,
        hint: "Click to verify",
        color: d.color,
        iconHtml: d.iconHtml,
        selected: ctx.state.powerFilter === d.key,
        onClick: function () {
          ctx.setState({ powerFilter: ctx.state.powerFilter === d.key ? null : d.key });
        },
      };
    });

    return h(
      "div",
      h("div.mb-lg", W.kpiRow(cards, 3)),
      panel(ctx) || overviewTable(ctx, rows)
    );
  }

  App.views = App.views || {};
  App.views.powerStatus = {
    label: "Power Status",
    icon: "power",
    title: "Power Status",
    subtitle: "AC and battery backup health",
    render: render,
  };
})(window.App = window.App || {});
