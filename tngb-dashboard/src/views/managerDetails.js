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
    var attention = App.data.allBranches().filter(function (b) { return b.status === "Attention"; }).length;

    var summary = W.summaryCards([
      { label: "Total Managers", value: stats.totalBranches, color: COLORS.navy, iconHtml: App.ICONS.managers },
      { label: "Districts Covered", value: stats.totalDistricts, color: COLORS.navy, iconHtml: App.ICONS.map },
      { label: "Branches Needing Attention", value: attention, color: COLORS.amber, iconHtml: App.ICONS.alerts },
    ], 3);

    var shown = matches.slice(0, ROW_LIMIT);

    var table = h(
      "div.card",
      { style: "overflow:hidden;" },
      W.listHeader({
        iconHtml: App.ICONS.managers,
        color: "#4338ca",
        title: "Branch Manager Directory",
        count: matches.length,
        subtitle: ["One manager record per branch · showing ", App.dom.val(shown.length)],
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
            {
              label: "Manager Name",
              className: "sub",
              render: function (b) {
                return h("span", { style: "color:var(--ink-body);font-weight:600;" }, b.manager.name);
              },
            },
            { label: "Phone Number", className: "mono", render: function (b) { return b.manager.contact; } },
            { label: "Email ID", className: "sub", render: function (b) { return b.manager.email; } },
            {
              label: "Branch Status",
              render: function (b) {
                return badge(b.status, b.status === "Attention" ? COLORS.amber : COLORS.green);
              },
            },
          ], shown, {
            onRowClick: function (b) {
              ctx.setState({ selectedRegion: b.district, selectedBranchId: b.id });
              ctx.go("overview");
            },
          }))
        : h("div", { style: "padding:40px;text-align:center;color:var(--ink-soft);" },
            "No manager matches that search.")
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
