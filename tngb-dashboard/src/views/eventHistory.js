/* Event History: the searchable, filterable log of every panel event. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var badge = App.dom.badge;
  var W = App.widgets;
  var u = App.utils;
  var COLORS = u.COLORS;

  var ROW_LIMIT = 400;

  function render(ctx) {
    var all = App.data.allEvents();
    var counts = App.data.eventCounts();
    var typeFilter = ctx.state.ehTypeFilter;
    var search = (ctx.state.ehSearch || "").toLowerCase();

    var matches = all.filter(function (e) {
      if (typeFilter && e.type !== typeFilter) return false;
      if (!search) return true;
      return u.includesCI(e.branch, search) || u.includesCI(e.district, search);
    });

    var busiest = App.data.EVENT_TYPES.slice().sort(function (a, b) {
      return counts[b] - counts[a];
    })[0];

    var summary = W.summaryCards([
      { label: "Total Events Logged", value: all.length, color: COLORS.navy, iconHtml: App.ICONS.history },
      {
        label: "Events Today",
        value: all.filter(function (e) { return e.time.indexOf(App.data.TODAY) === 0; }).length,
        color: COLORS.navy,
        iconHtml: App.ICONS.activities,
      },
      { label: "Most Frequent Event", value: busiest, color: COLORS.amber, iconHtml: App.ICONS.alerts },
    ], 3);

    var chips = W.chipRow({
      types: App.data.EVENT_TYPES,
      counts: counts,
      colors: App.data.EVENT_COLORS,
      active: typeFilter,
      onPick: function (t) { ctx.setState({ ehTypeFilter: typeFilter === t ? null : t }); },
      onClear: function () { ctx.setState({ ehTypeFilter: null }); },
    });

    var table = h(
      "div.card",
      { style: "overflow:hidden;" },
      W.listHeader({
        title: "Event Log",
        count: matches.length,
        subtitle: "Newest first · click a chip to filter by event type",
        controls: W.searchInput({
          id: "eh-search",
          value: ctx.state.ehSearch,
          placeholder: "Search branch or district…",
          width: "280px",
          onInput: function (v) { ctx.setState({ ehSearch: v }); },
        }),
      }),
      matches.length
        ? h("div.table-scroll", { style: "max-height:600px;" }, W.dataTable([
            { label: "Time", key: "time", className: "mono" },
            { label: "Branch", key: "branch", className: "name" },
            { label: "District", key: "district", className: "sub" },
            {
              label: "Event",
              render: function (e) { return badge(e.type, App.data.EVENT_COLORS[e.type]); },
            },
            { label: "Zone", className: "sub", render: function (e) { return e.zone || "--"; } },
          ], matches.slice(0, ROW_LIMIT), {
            onRowClick: function (e) {
              var branch = App.data.branchById(e.branchId);
              if (!branch) return;
              ctx.setState({ selectedRegion: branch.district, selectedBranchId: branch.id });
              ctx.go("overview");
            },
          }))
        : h("div", { style: "padding:40px;text-align:center;color:var(--ink-soft);" },
            "No event matches those filters."),
      matches.length > ROW_LIMIT
        ? h("div", {
            style: "padding:12px 22px;border-top:1px solid var(--line-faint);" +
              "font-size:11.5px;color:var(--ink-faint);",
          }, "Showing the newest ", App.dom.val(ROW_LIMIT), " of ", App.dom.val(matches.length),
             " matching events. Narrow the search or export the report for the rest.")
        : null
    );

    return h("div", summary, chips, table);
  }

  App.views = App.views || {};
  App.views.eventHistory = {
    label: "Event History",
    icon: "history",
    title: "Event History",
    subtitle: "Past panel event log",
    render: render,
  };
})(window.App = window.App || {});
