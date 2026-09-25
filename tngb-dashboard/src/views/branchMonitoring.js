/* Branch Monitoring: district roll-up table plus the full branch grid. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var W = App.widgets;
  var u = App.utils;
  var COLORS = u.COLORS;

  var GRID_LIMIT = 400;

  /* District rows carry their own manager contact, drawn from a stable seed
     so the same district always shows the same regional contact. */
  function districtRows() {
    return App.data.REGIONS.map(function (r, i) {
      var s = App.data.districtStats(r.name);
      var dr = u.seededRnd(r.name + "-regional-manager");
      var status = App.data.districtStatus(s);
      return {
        name: r.name,
        code: "TNGB-D" + u.pad2(i + 1),
        total: r.branchCount,
        armed: s.armed, disarmed: s.disarmed,
        online: s.online, offline: s.offline,
        alarm: s.alarm, fault: s.fault,
        status: status,
        managerName: u.pick(dr, App.data.FIRST_NAMES) + " " + u.pick(dr, App.data.LAST_NAMES),
        contact: "+91 9" + String(400000000 + Math.floor(dr() * 99999999)).slice(0, 9),
      };
    });
  }

  function render(ctx) {
    var stats = App.data.networkStats();

    var summary = W.summaryCards([
      { label: "Total Branches", value: stats.totalBranches, color: COLORS.navy, iconHtml: App.ICONS.branches },
      { label: "Districts Covered", value: stats.totalDistricts, color: COLORS.navy, iconHtml: App.ICONS.map },
      {
        label: "Online / Offline", color: COLORS.green,
        pair: [
          { value: stats.online, color: COLORS.green, iconHtml: App.ICONS.online },
          { value: stats.offline, color: COLORS.red, iconHtml: App.ICONS.offline },
        ],
      },
      {
        label: "Armed / Disarmed", color: COLORS.navy,
        pair: [
          { value: stats.armed, color: COLORS.navy, iconHtml: App.ICONS.arm },
          { value: stats.disarmed, color: COLORS.grey, iconHtml: App.ICONS.disarm },
        ],
      },
    ], 4);

    var rows = districtRows();
    var numCol = function (key, color) {
      return {
        label: key.charAt(0).toUpperCase() + key.slice(1),
        align: "right",
        render: function (r) {
          return h("span.val", { style: color ? "color:" + color + ";" : "" }, String(r[key]));
        },
      };
    };

    var districtTable = h(
      "div.card.mb-lg",
      { style: "overflow:hidden;" },
      h("div.card-head",
        h("div",
          h("div.card-title", "District-wise Summary"),
          h("div.card-sub", App.dom.val(rows.length), " districts · click a row to open its branches"))),
      h("div.table-scroll", { style: "max-height:420px;" }, W.dataTable([
        { label: "District", key: "name", className: "name" },
        { label: "Code", key: "code", className: "mono" },
        { label: "Total", key: "total", align: "right", className: "name" },
        numCol("armed", COLORS.navy),
        numCol("disarmed", COLORS.grey),
        numCol("online", COLORS.green),
        numCol("offline", COLORS.red),
        numCol("alarm", COLORS.red),
        numCol("fault", COLORS.amber),
        { label: "Status", render: function (r) { return App.dom.badge(r.status, App.data.STATUS_COLORS[r.status]); } },
        { label: "Manager", key: "managerName", className: "sub" },
        { label: "Contact", key: "contact", className: "mono" },
      ], rows, {
        onRowClick: function (r) {
          ctx.setState({ selectedRegion: r.name, selectedBranchId: null });
          ctx.go("overview");
        },
      }))
    );

    var search = (ctx.state.bmSearch || "").toLowerCase();
    var matches = App.data.allBranches().filter(function (b) {
      return !search || u.includesCI(b.name, search) || u.includesCI(b.district, search);
    });

    var grid = h(
      "div.card",
      { style: "overflow:hidden;" },
      W.listHeader({
        iconHtml: App.ICONS.branches,
        title: "All Branches",
        count: matches.length,
        subtitle: "Every branch network-wide · click a card for full detail",
        controls: W.searchInput({
          id: "bm-search",
          value: ctx.state.bmSearch,
          placeholder: "Search branch or district…",
          width: "280px",
          onInput: function (v) { ctx.setState({ bmSearch: v }); },
        }),
      }),
      matches.length
        ? h("div.branch-grid", { style: "max-height:560px;" }, matches.slice(0, GRID_LIMIT).map(function (b) {
            return h(
              "button.branch-card",
              {
                type: "button",
                onclick: function () {
                  ctx.setState({ selectedRegion: b.district, selectedBranchId: b.id });
                  ctx.go("overview");
                },
              },
              h(
                "div.flex-between",
                { style: "align-items:flex-start;" },
                h("div", { style: "min-width:0;" },
                  h("div.branch-card-name", b.name),
                  h("div.branch-card-district", b.district)),
                h("span.dot.md", {
                  style: "margin-top:4px;background:" + u.connectivityColor(b.connectivity) + ";",
                })
              ),
              h("div.flex.gap-6", { style: "margin-top:10px;" },
                W.panelBadge(b.panelStatus, "sm"),
                W.connBadge(b.connectivity, "sm"))
            );
          }))
        : h("div", { style: "padding:40px;text-align:center;color:var(--ink-soft);" },
            "No branch matches that search."),
      matches.length > GRID_LIMIT
        ? W.truncationNote(GRID_LIMIT, matches.length, "branches · search to narrow the list")
        : null
    );

    return h("div", summary, districtTable, grid);
  }

  App.views = App.views || {};
  App.views.branchMonitoring = {
    label: "Branch Monitoring",
    icon: "branches",
    title: "Branch Monitoring",
    subtitle: "Per-branch status and details",
    render: render,
  };
})(window.App = window.App || {});
