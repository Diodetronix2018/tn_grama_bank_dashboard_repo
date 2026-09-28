/* Manager Details: one branch-manager record per branch. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var badge = App.dom.badge;
  var W = App.widgets;
  var u = App.utils;
  var COLORS = u.COLORS;

  var ROW_LIMIT = 400;

  function render(ctx) {
    var stats = App.data.networkStats();
    var search = (ctx.state.mgrSearch || "").toLowerCase();

    var matches = App.data.allBranches().filter(function (b) {
      if (!search) return true;
      return u.includesCI(b.branchIdCode, search) ||
        u.includesCI(b.name, search) ||
        u.includesCI(b.district, search) ||
        u.includesCI(b.manager.name, search);
    });

    // Network-wide, like the two cards beside it, not just the search results.
    var byStatus = { Normal: 0, Offline: 0, Alarm: 0, Fault: 0 };
    App.data.allBranches().forEach(function (b) { byStatus[b.status] = (byStatus[b.status] || 0) + 1; });

    var summary = W.summaryCards([
      { label: "Total Managers", value: stats.totalBranches, color: COLORS.sky, iconHtml: App.ICONS.managers },
      { label: "Regions Covered", value: stats.totalDistricts, color: COLORS.yellow, iconHtml: App.ICONS.map },
      {
        label: "Branch Status (Normal / Offline / Alarm / Fault)", color: COLORS.green,
        pair: [
          { value: byStatus.Normal, color: COLORS.green, iconHtml: App.ICONS.shield },
          { value: byStatus.Offline, color: COLORS.slate, iconHtml: App.ICONS.offline },
          { value: byStatus.Alarm, color: COLORS.red, iconHtml: App.ICONS.bell },
          { value: byStatus.Fault, color: COLORS.amber, iconHtml: App.ICONS.fault },
        ],
      },
    ], 3);

    var shown = matches.slice(0, ROW_LIMIT);

    var table = h(
      "div.card",
      { style: "overflow:hidden;" },
      W.listHeader({
        iconHtml: App.ICONS.managers,
        color: COLORS.indigo,
        title: "Branch Manager Directory",
        count: matches.length,
        subtitle: "One manager record per branch · click a row to open the branch",
        controls: W.searchInput({
          id: "mgr-search",
          value: ctx.state.mgrSearch,
          placeholder: "Search code, branch, district or manager…",
          width: "300px",
          onInput: function (v) { ctx.setState({ mgrSearch: v }); },
        }),
      }),
      matches.length
        ? h("div.table-scroll", { style: "max-height:600px;" }, W.dataTable([
            { label: "Branch Code", key: "branchIdCode", className: "mono" },
            { label: "District", key: "district", className: "sub" },
            { label: "Branch Name", key: "name", className: "name" },
            { label: "Manager Name", className: "name", render: function (b) { return b.manager.name; } },
            { label: "Phone Number", className: "mono", render: function (b) { return b.manager.contact; } },
            { label: "Email ID", className: "sub", render: function (b) { return b.manager.email; } },
            {
              label: "Branch Status",
              render: function (b) { return badge(b.status, App.data.STATUS_COLORS[b.status]); },
            },
          ], shown, {
            onRowClick: function (b) {
              ctx.setState({ selectedRegion: b.district, selectedBranchId: b.id });
              ctx.go("overview");
            },
          }))
        : W.emptyNote("No manager matches that search."),
      matches.length > ROW_LIMIT
        ? W.truncationNote(ROW_LIMIT, matches.length, "managers", "Search to narrow the list.")
        : null
    );

    return h("div", summary, table);
  }

  App.views = App.views || {};
  App.views.managerDetails = {
    label: "Manager Details",
    icon: "managers",
    title: "Manager Details",
    subtitle: "Branch manager directory",
    render: render,
  };
})(window.App = window.App || {});
