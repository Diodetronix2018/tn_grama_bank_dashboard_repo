/* Overview: network KPIs, status split, district list and branch spotlight. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var badge = App.dom.badge;
  var val = App.dom.val;
  var W = App.widgets;
  var u = App.utils;
  var COLORS = u.COLORS;

  /* Which branches sit behind each clickable KPI. */
  var KPI_FILTERS = {
    online: { title: "Online Panels", match: function (b) { return b.connectivity === "Online"; } },
    offline: { title: "Offline Panels", match: function (b) { return b.connectivity === "Offline"; } },
    armed: { title: "Armed Panels", match: function (b) { return b.panelStatus === "Armed"; } },
    disarmed: { title: "Disarmed Panels", match: function (b) { return b.panelStatus === "Disarmed"; } },
    alarm: { title: "Alarm Panels", match: function (b) { return b.panelStatus === "Alarm Active"; } },
    fault: { title: "Fault Panels", match: function (b) { return b.panelStatus === "Fault"; } },
  };

  /* Two-segment donut drawn with stroke-dasharray on a 100-unit circumference. */
  function donut(a, b) {
    var total = a.count + b.count || 1;
    var aDash = (a.count / total) * 100;
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "88");
    svg.setAttribute("height", "88");
    svg.setAttribute("viewBox", "0 0 42 42");
    svg.innerHTML =
      '<circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#e6e9ef" stroke-width="6"></circle>' +
      '<circle cx="21" cy="21" r="15.9" fill="transparent" stroke="' + a.color +
        '" stroke-width="6" stroke-dasharray="' + aDash + ' 100" stroke-dashoffset="0"></circle>' +
      '<circle cx="21" cy="21" r="15.9" fill="transparent" stroke="' + b.color +
        '" stroke-width="6" stroke-dasharray="' + (100 - aDash) + ' 100" stroke-dashoffset="' + -aDash + '"></circle>';
    return { node: svg, pct: Math.round((a.count / total) * 100) };
  }

  function pie(title, a, b) {
    var d = donut(a, b);
    return h(
      "div.pie",
      d.node,
      h("div.pie-pct", d.pct + "%"),
      h("div.pie-title", title),
      h(
        "div.pie-legend",
        h("span.legend-item", h("span.dot", { style: "background:" + a.color + ";" }), a.label + " ", val(a.count)),
        h("span.legend-item", h("span.dot", { style: "background:" + b.color + ";" }), b.label + " ", val(b.count))
      )
    );
  }

  function statusCard(stats) {
    var normalPct = Math.round((stats.normal / (stats.totalBranches || 1)) * 100);
    return h(
      "div.card.card-pad",
      h(
        "div.flex-between",
        { style: "margin-bottom:6px;" },
        h("div.card-title", "Overall System Status"),
        badge(normalPct + "% Normal", normalPct >= 90 ? COLORS.green : COLORS.amber)
      ),
      h("div", { style: "font-size:11.5px;color:var(--ink-soft);margin-bottom:18px;" },
        "Live split of branch panels network-wide"),
      h(
        "div.pies",
        pie("Normal / Abnormal",
          { label: "Normal", count: stats.normal, color: COLORS.green },
          { label: "Abnormal", count: stats.abnormal, color: COLORS.red }),
        pie("Online / Offline",
          { label: "Online", count: stats.online, color: COLORS.green },
          { label: "Offline", count: stats.offline, color: COLORS.slate }),
        pie("Armed / Disarmed",
          { label: "Armed", count: stats.armed, color: COLORS.navy },
          { label: "Disarmed", count: stats.disarmed, color: COLORS.grey })
      )
    );
  }

  function regionCard(ctx) {
    var search = (ctx.state.regionSearch || "").toLowerCase();
    var regions = App.data.REGIONS.filter(function (r) {
      return !search || u.includesCI(r.name, search);
    });

    return h(
      "div.card.card-pad.flex-col",
      h(
        "div.flex-between",
        { style: "margin-bottom:12px;" },
        h("div.card-title", "All Regions ",
          h("span.muted-count", "(" + App.data.REGIONS.length + ")")),
        h("div", { style: "font-size:10px;color:var(--ink-faint);font-weight:600;letter-spacing:.03em;" },
          "CLICK TO VIEW")
      ),
      h("div", { style: "margin-bottom:12px;" }, W.searchInput({
        id: "region-search",
        value: ctx.state.regionSearch,
        placeholder: "Search district…",
        onInput: function (v) { ctx.setState({ regionSearch: v }); },
      })),
      h(
        "div.list-scroll",
        { style: "max-height:250px;" },
        regions.length ? regions.map(function (r) {
          var s = App.data.districtStats(r.name);
          var status = App.data.districtStatus(s);
          var selected = r.name === ctx.state.selectedRegion;
          return h(
            "button.row-item" + (selected ? ".is-selected" : ""),
            {
              type: "button",
              onclick: function () {
                ctx.setState({ selectedRegion: r.name, selectedBranchId: null });
              },
            },
            h(
              "div",
              h("div.row-item-name", r.name),
              h("div.row-item-sub",
                val(r.branchCount), " branches · ", val(s.offline), " offline · ",
                val(s.alarm), " alarm · ", val(s.fault), " fault")
            ),
            badge(status, App.data.STATUS_COLORS[status])
          );
        }) : h("div.row-item-sub", { style: "padding:12px;" }, "No district matches that search.")
      )
    );
  }

  function branchListCard(ctx, branches, selectedId) {
    return h(
      "div.card",
      { style: "padding:16px;" },
      h("div.card-title", { style: "margin-bottom:12px;font-size:13.5px;" },
        "Branches in " + ctx.state.selectedRegion),
      h(
        "div.list-scroll",
        { style: "max-height:480px;" },
        branches.map(function (b) {
          return h(
            "button.row-item.tight" + (b.id === selectedId ? ".is-selected" : ""),
            { type: "button", onclick: function () { ctx.setState({ selectedBranchId: b.id }); } },
            h("span.row-item-name", b.name),
            W.panelBadge(b.panelStatus)
          );
        })
      )
    );
  }

  function spotlightCard(branch) {
    var manager = [
      ["Manager Name", branch.manager.name],
      ["ID", branch.manager.id],
      ["Contact", branch.manager.contact],
      ["Email", branch.manager.email],
    ];

    return h(
      "div.card",
      { style: "overflow:hidden;" },
      h(
        "div.card-head",
        h(
          "div",
          h("div.card-title", { style: "font-size:15px;" }, branch.name),
          h("div.card-sub.mono", branch.branchIdCode + " · " + branch.district)
        ),
        h("div.flex.gap-8", W.connBadge(branch.connectivity), W.panelBadge(branch.panelStatus))
      ),
      h(
        "div.spotlight-grid",
        h(
          "div.spotlight-left",
          h("div.section-label", "Recent Panel Events"),
          h("div.flex-col", { style: "gap:9px;" }, branch.events.map(function (e) {
            var color = App.data.EVENT_COLORS[e.type] || COLORS.grey;
            return h(
              "div.event-line",
              h("span.dot.md", { style: "background:" + color + ";" }),
              h(
                "div.grow",
                h("div.event-line-type", e.type),
                e.zone ? h("div.event-line-zone", e.zone) : null
              ),
              h("div.event-line-time", e.time)
            );
          }))
        ),
        h(
          "div.spotlight-right",
          h("div.section-label", "Branch Manager Details"),
          h("div.flex-col", { style: "gap:8px;" }, manager.map(function (kv) {
            return h("div.kv-row", h("span", kv[0]), h("span", kv[1]));
          }))
        )
      )
    );
  }

  function render(ctx) {
    var stats = App.data.networkStats();

    var kpiDefs = [
      { key: "totalBranches", label: "Total Branches", value: stats.totalBranches, hint: "Click to view all branches", color: COLORS.navy, iconHtml: App.ICONS.branches, go: "branchMonitoring" },
      { key: "totalRegions", label: "Total Region", value: stats.totalDistricts, hint: "Click to view map", color: COLORS.navy, iconHtml: App.ICONS.map, go: "locationMaps" },
      { key: "online", label: "Online Panels", value: stats.online, hint: "Click to view list", color: COLORS.green, iconHtml: App.ICONS.online },
      { key: "offline", label: "Offline Panels", value: stats.offline, hint: "Click to view list", color: COLORS.slate, iconHtml: App.ICONS.offline },
      { key: "armed", label: "Armed Panels", value: stats.armed, hint: "Click to view list", color: COLORS.navy, iconHtml: App.ICONS.lockClosed },
      { key: "disarmed", label: "Disarmed Panels", value: stats.disarmed, hint: "Click to view list", color: COLORS.grey, iconHtml: App.ICONS.lockOpen },
      { key: "alarm", label: "Alarm Panels", value: stats.alarm, hint: "Click to view list", color: COLORS.red, iconHtml: App.ICONS.bell },
      { key: "fault", label: "Fault Panels", value: stats.fault, hint: "Click to view list", color: COLORS.amber, iconHtml: App.ICONS.fault },
    ];

    var kpis = kpiDefs.map(function (d) {
      return {
        label: d.label, value: d.value, hint: d.hint, color: d.color, iconHtml: d.iconHtml,
        selected: ctx.state.kpiFilter === d.key,
        onClick: d.go
          ? function () { ctx.go(d.go); }
          : function () {
              ctx.setState({ kpiFilter: ctx.state.kpiFilter === d.key ? null : d.key });
            },
      };
    });

    var panel = null;
    if (ctx.state.kpiFilter && KPI_FILTERS[ctx.state.kpiFilter]) {
      var meta = KPI_FILTERS[ctx.state.kpiFilter];
      var matches = App.data.allBranches().filter(meta.match);
      panel = W.filterPanel({
        title: meta.title,
        count: matches.length,
        subtitle: "Click a row to open that branch in the spotlight below",
        maxHeight: 360,
        rows: matches.slice(0, 120),
        columns: [
          { label: "Branch", key: "name", className: "name" },
          { label: "District", key: "district", className: "sub" },
          { label: "Panel Status", render: function (b) { return W.panelBadge(b.panelStatus); } },
          { label: "Connectivity", render: function (b) { return W.connBadge(b.connectivity); } },
        ],
        onRowClick: function (b) {
          ctx.setState({ selectedRegion: b.district, selectedBranchId: b.id, kpiFilter: null });
        },
        onClose: function () { ctx.setState({ kpiFilter: null }); },
      });
    }

    var branches = App.data.branchesIn(ctx.state.selectedRegion);
    var selectedId = ctx.state.selectedBranchId &&
      branches.some(function (b) { return b.id === ctx.state.selectedBranchId; })
        ? ctx.state.selectedBranchId
        : branches[0].id;
    var selected = branches.find(function (b) { return b.id === selectedId; });

    return h(
      "div",
      W.kpiRow(kpis, 4),
      panel ? h("div.mt-md", panel) : null,
      h("div.grid.align-start.mt-lg", { style: "grid-template-columns:1.1fr 1fr;" },
        statusCard(stats), regionCard(ctx)),
      h("div.grid.align-start.mt-lg", { style: "grid-template-columns:270px minmax(0,1fr);" },
        branchListCard(ctx, branches, selectedId),
        spotlightCard(selected))
    );
  }

  App.views = App.views || {};
  App.views.overview = {
    label: "Overview",
    icon: "overview",
    title: "Dashboard Overview",
    subtitle: "Real-time status across all branches, districts and alarm panels",
    render: render,
  };
})(window.App = window.App || {});
