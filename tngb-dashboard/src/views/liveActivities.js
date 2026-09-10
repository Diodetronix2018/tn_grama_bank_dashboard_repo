/* Live Activities: the network event feed, in a dark command-centre layout
   or a lighter classic list. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var badge = App.dom.badge;
  var iconChip = App.dom.iconChip;
  var W = App.widgets;

  var FEED_LIMIT = 200;

  var VIEW_MODES = [
    { key: "command", label: "Command Center" },
    { key: "classic", label: "Classic View" },
  ];

  function latestCard(event) {
    var color = App.data.EVENT_COLORS[event.type];
    return h(
      "div.latest-card",
      {
        style: "border-color:" + color + "35;border-left:4px solid " + color +
          ";box-shadow:0 4px 16px " + color + "1a;",
      },
      iconChip(App.EVENT_ICONS[event.type], color, { size: 52, radius: 14 }),
      h(
        "div.grow",
        h("div.latest-eyebrow", "Latest Activity"),
        h("div.flex-center.flex-wrap", { style: "gap:10px;" },
          h("span.latest-branch", event.branch),
          badge(event.type, color)),
        h("div.latest-meta", event.district + " · " + (event.zone || "--"))
      ),
      h(
        "div",
        { style: "text-align:right;flex:0 0 auto;" },
        h("span.dot.md", {
          style: "display:inline-block;margin-right:6px;background:" + color +
            ";box-shadow:0 0 6px " + color + ";",
        }),
        h("span.mono", { style: "font-size:12px;color:var(--ink-muted);" }, event.time)
      )
    );
  }

  function feedRow(event, dark) {
    var color = App.data.EVENT_COLORS[event.type];
    return h(
      "div.feed-row" + (dark ? ".dark" : ""),
      { style: dark ? "border-color:" + color + "30;" : "border-left:3px solid " + color + ";" },
      h("span.icon-chip", {
        style: dark
          ? "width:36px;height:36px;flex:0 0 36px;border-radius:10px;background:" + color +
            "22;color:" + color + ";border-color:" + color + "55;"
          : "width:38px;height:38px;flex:0 0 38px;border-radius:11px;background:" + color +
            "14;color:" + color + ";border-color:" + color + "30;",
        html: App.EVENT_ICONS[event.type],
      }),
      h(
        "div.grow",
        dark
          ? h("div.feed-branch", event.branch)
          : h("div.flex-center.flex-wrap", { style: "gap:8px;" },
              h("span.feed-branch", event.branch), badge(event.type, color)),
        h("div.feed-meta", event.district + " · " + (event.zone || "--"))
      ),
      dark ? badge(event.type, color) : null,
      dark
        ? h("div.feed-time-dark", event.time)
        : h("span.time-pill", {
            style: "color:" + color + ";background:" + color + "12;",
          }, event.time)
    );
  }

  function render(ctx) {
    var all = App.data.allEvents();
    var counts = App.data.eventCounts();
    var filter = ctx.state.liveActivityFilter;
    var mode = ctx.state.liveViewMode || "command";

    var filtered = filter
      ? all.filter(function (e) { return e.type === filter; })
      : all;
    var shown = filtered.slice(0, FEED_LIMIT);

    var chipOpts = {
      types: App.data.EVENT_TYPES,
      counts: counts,
      colors: App.data.EVENT_COLORS,
      active: filter,
      onPick: function (t) {
        ctx.setState({ liveActivityFilter: filter === t ? null : t });
      },
      onClear: function () { ctx.setState({ liveActivityFilter: null }); },
    };

    var switcher = h("div.flex", { style: "justify-content:flex-end;margin-bottom:14px;" },
      W.segmented(VIEW_MODES, mode, function (m) { ctx.setState({ liveViewMode: m }); }));

    var body;
    if (mode === "command") {
      body = h(
        "div.command-panel",
        h(
          "div.command-head",
          h(
            "div",
            h("div.command-title", "Live Activity Feed"),
            h("div.command-sub", filter
              ? filtered.length + " " + filter + " events · " + all.length + " total today"
              : all.length + " events across the network today")
          ),
          W.chipRow(Object.assign({}, chipOpts, { dark: true }))
        ),
        h("div", { style: "max-height:560px;overflow-y:auto;" },
          shown.map(function (e) { return feedRow(e, true); }))
      );
    } else {
      body = h(
        "div",
        W.chipRow(chipOpts),
        h("div.feed", shown.map(function (e) { return feedRow(e, false); }))
      );
    }

    return h(
      "div",
      all[0] ? latestCard(all[0]) : null,
      switcher,
      body,
      filtered.length > FEED_LIMIT
        ? h("div", {
            style: "text-align:center;font-size:11.5px;color:var(--ink-faint);margin-top:12px;",
          }, "Showing the newest " + FEED_LIMIT + " of " + filtered.length +
             " events. Use Event History for the full log.")
        : null
    );
  }


  App.views = App.views || {};
  App.views.liveActivities = {
    label: "Live Activities",
    icon: "activities",
    title: "Live Activities",
    subtitle: "Real-time panel event feed",
    render: render,
  };
})(window.App = window.App || {});
