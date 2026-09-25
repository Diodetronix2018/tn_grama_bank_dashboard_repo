/* Zone Status: pick a branch, then read its 8-zone panel (plus the panel
   tamper circuit) in one of three presentations - grand cards, a dark
   showcase, or a dense table. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var badge = App.dom.badge;
  var iconChip = App.dom.iconChip;
  var W = App.widgets;
  var u = App.utils;
  var COLORS = u.COLORS;

  var VIEW_MODES = [
    { key: "grand", label: "Grand View" },
    { key: "showcase", label: "Showcase View" },
    { key: "table", label: "Table View" },
  ];

  var PICKER_MODES = [
    { key: "district", label: "By District" },
    { key: "grid", label: "All (Grid)" },
  ];

  /* The branch the view opens on: the first one actually in alarm, so the
     default screen shows a panel worth looking at. */
  function defaultBranch() {
    var all = App.data.allBranches();
    return all.find(function (b) { return b.panelStatus === "Alarm Active"; }) || all[0];
  }

  /* The ninth card beside the 8 zones: the panel's tamper circuit. It trips
     when any zone reports an open tamper switch, the same rule that feeds
     Tamper Active on Intrusion Status, so the two always agree. */
  function panelTamper(zones) {
    var tripped = zones.find(function (z) { return z.tamper === "Tamper"; });
    return {
      name: "Tamper",
      label: tripped ? "Tamper" : "Normal",
      color: tripped ? COLORS.orange : COLORS.green,
      detail: tripped ? tripped.name : "All 8 zones secure",
      lastTrigger: tripped ? tripped.lastTrigger : "--",
    };
  }

  function heroStats(zones) {
    var count = function (fn) { return zones.filter(fn).length; };
    var normal = count(function (z) { return z.dominantLabel === "Normal"; });
    return {
      active: count(function (z) { return z.status === "Active"; }),
      alarm: count(function (z) { return z.condition === "Alarm"; }),
      fault: count(function (z) { return z.fault === "Fault"; }),
      tamper: count(function (z) { return z.tamper === "Tamper"; }),
      healthPct: Math.round((normal / (zones.length || 1)) * 100),
    };
  }

  function picker(ctx, selectedId) {
    var search = (ctx.state.zoneSearch || "").toLowerCase();
    var pickerMode = ctx.state.zonePickerMode || "district";
    var body;

    if (pickerMode === "district") {
      var railDistrict = ctx.state.zonePickerDistrict ||
        (App.data.branchById(selectedId) || {}).district ||
        App.data.REGIONS[0].name;

      var rail = h("div.district-rail", App.data.REGIONS.map(function (r) {
        return h(
          "button.rail-row" + (r.name === railDistrict ? ".is-selected" : ""),
          { type: "button", onclick: function () { ctx.setState({ zonePickerDistrict: r.name }); } },
          h("span", r.name),
          h("span.rail-count", String(r.branchCount))
        );
      }));

      var branches = App.data.branchesIn(railDistrict).filter(function (b) {
        return !search || u.includesCI(b.name, search);
      });

      var tiles = h("div.picker-grid", branches.length
        ? branches.map(function (b) {
            return h(
              "button.picker-tile" + (b.id === selectedId ? ".is-selected" : ""),
              { type: "button", onclick: function () { ctx.setState({ zoneSelectedBranchId: b.id }); } },
              h("span", b.name),
              W.panelBadge(b.panelStatus, "sm")
            );
          })
        : h("div.row-item-sub", "No branch in this district matches that search."));

      body = h("div.grid.split", { style: "grid-template-columns:230px minmax(0,1fr);gap:0;" }, rail, tiles);
    } else {
      var all = App.data.allBranches().filter(function (b) {
        return !search || u.includesCI(b.name, search) || u.includesCI(b.district, search);
      });
      body = h("div.picker-compact", all.map(function (b) {
        return h(
          "button.picker-chip" + (b.id === selectedId ? ".is-selected" : ""),
          { type: "button", onclick: function () { ctx.setState({ zoneSelectedBranchId: b.id }); } },
          h("span.dot", { style: "background:" + u.panelStatusColor(b.panelStatus) + ";" }),
          h("span", b.name)
        );
      }));
    }

    return h(
      "div.card.mb-lg",
      { style: "overflow:hidden;" },
      h(
        "div.card-head",
        h("div.card-title", "Select a branch ",
          h("span.muted-count", "(" + App.data.networkStats().totalBranches + " total)")),
        h(
          "div.flex-center.flex-wrap",
          W.segmented(PICKER_MODES, pickerMode, function (m) {
            ctx.setState({ zonePickerMode: m });
          }),
          W.segmented(VIEW_MODES, ctx.state.zoneViewMode || "showcase", function (m) {
            ctx.setState({ zoneViewMode: m });
          }),
          W.searchInput({
            id: "zone-search",
            value: ctx.state.zoneSearch,
            placeholder: "Search branch or district…",
            width: "220px",
            onInput: function (v) { ctx.setState({ zoneSearch: v }); },
          })
        )
      ),
      body
    );
  }

  function grandView(branch, zones) {
    var hero = heroStats(zones);
    var stat = function (label, value, color) {
      return h("div.zone-hero-stat",
        h("div.zone-hero-num", { style: color ? "color:" + color + ";" : "" }, String(value)),
        h("div.zone-hero-cap", label));
    };

    var lightBadge = function (text) {
      return h("span.badge", {
        style: "background:rgba(255,255,255,.16);color:#fff;border-color:rgba(255,255,255,.3);",
      }, text);
    };

    return h(
      "div",
      h(
        "div.zone-hero",
        h(
          "div.flex-center",
          { style: "gap:18px;" },
          h("span.icon-chip", {
            style: "width:60px;height:60px;flex:0 0 60px;border-radius:16px;color:#fff;" +
              "background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.25);",
            html: App.ICONS.branches,
          }),
          h(
            "div",
            h("div.zone-hero-name", branch.name),
            h("div.zone-hero-sub", branch.district + " · 8-zone + tamper burglar alarm panel"),
            h("div.flex.gap-8", { style: "margin-top:12px;" },
              lightBadge(branch.panelStatus), lightBadge(branch.connectivity))
          )
        ),
        h("div.zone-hero-stats",
          stat("Active", hero.active),
          stat("Alarm", hero.alarm, "#fca5a5"),
          stat("Fault", hero.fault, "#fcd34d"),
          stat("Tamper", hero.tamper, "#fdba74"))
      ),
      h("div.grid.grid-3", zones.map(function (z) {
        return h(
          "div.zone-card",
          h("span.zone-card-bar", { style: "background:" + z.dominant + ";" }),
          h("div.flex-between",
            iconChip(App.ICONS.zoneDoor, z.dominant, { class: "lg" }),
            h("span.zone-num", "ZONE " + z.num)),
          h("div.zone-card-name", z.name),
          h("div", { style: "margin-top:10px;" },
            h("span.badge", { style: u.badgeStyle(z.dominant) + "font-size:12px;padding:4px 12px;" },
              z.dominantLabel)),
          h("div.flex.gap-6.flex-wrap", { style: "margin-top:10px;" },
            badge(z.status, z.statusColor, "sm"),
            badge(z.fault, z.faultColor, "sm"),
            badge(z.tamper, z.tamperColor, "sm")),
          h("div.zone-card-foot", "Last trigger: ", App.dom.val(z.lastTrigger))
        );
      }).concat(grandTamperCard(panelTamper(zones))))
    );
  }

  function grandTamperCard(t) {
    return h(
      "div.zone-card",
      h("span.zone-card-bar", { style: "background:" + t.color + ";" }),
      h("div.flex-between",
        iconChip(App.ICONS.tamperLg, t.color, { class: "lg" }),
        h("span.zone-num", "TAMPER")),
      h("div.zone-card-name", t.name),
      h("div", { style: "margin-top:10px;" },
        h("span.badge", { style: u.badgeStyle(t.color) + "font-size:12px;padding:4px 12px;" }, t.label)),
      h("div.flex.gap-6.flex-wrap", { style: "margin-top:10px;" }, badge(t.detail, t.color, "sm")),
      h("div.zone-card-foot", "Last trigger: ", App.dom.val(t.lastTrigger))
    );
  }

  function showcaseView(branch, zones) {
    var hero = heroStats(zones);
    var legend = function (color, count, label) {
      return h("div", h("span.dot.md", { style: "background:" + color + ";" }),
        h("span", App.dom.val(count), " " + label));
    };
    var darkBadge = function (text) {
      return h("span.badge", {
        style: "background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18);color:#fff;",
      }, text);
    };

    return h(
      "div.showcase",
      h(
        "div.showcase-head",
        h(
          "div.flex-center",
          { style: "gap:20px;" },
          h("span.icon-chip", {
            style: "width:64px;height:64px;flex:0 0 64px;border-radius:18px;color:#7dd3fc;" +
              "background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14);",
            html: App.ICONS.branches,
          }),
          h(
            "div",
            h("div.showcase-name", branch.name),
            h("div.showcase-sub", branch.district + " · 8-zone + tamper burglar alarm panel"),
            h("div.flex.gap-8", { style: "margin-top:14px;" },
              darkBadge(branch.panelStatus), darkBadge(branch.connectivity))
          )
        ),
        h(
          "div.flex-center",
          { style: "gap:22px;" },
          h("div.donut", {
            style: "background:conic-gradient(#22c55e 0deg " + hero.healthPct * 3.6 +
              "deg, rgba(255,255,255,.14) " + hero.healthPct * 3.6 + "deg 360deg);",
          }, h("div.donut-core",
            h("div.donut-pct", hero.healthPct + "%"),
            h("div.donut-cap", "NORMAL"))),
          h("div.showcase-legend",
            legend("#f87171", hero.alarm, "Alarm"),
            legend("#fbbf24", hero.fault, "Fault"),
            legend("#fb923c", hero.tamper, "Tamper"))
        )
      ),
      h("div.grid.grid-3", { style: "gap:18px;" }, zones.map(function (z) {
        var glow = z.dominantLabel === "Normal"
          ? "border-color:" + z.dominant + "22;"
          : "border-color:" + z.dominant + "66;box-shadow:0 0 0 1px " + z.dominant +
            "40, 0 0 30px " + z.dominant + "40, 0 4px 16px rgba(0,0,0,.4);";
        return h(
          "div.zone-card.dark",
          { style: glow },
          h("div.zone-watermark", String(z.num)),
          h("span.icon-chip", {
            style: "width:44px;height:44px;flex:0 0 44px;border-radius:12px;position:relative;z-index:1;" +
              "background:" + z.dominant + "22;color:" + z.dominant + ";border-color:" + z.dominant + "55;",
            html: App.ICONS.zoneDoor,
          }),
          h("div.zone-card-name", z.name),
          h("div", { style: "margin-top:8px;position:relative;z-index:1;" },
            h("span.badge", { style: u.badgeStyle(z.dominant) + "font-size:12px;padding:4px 12px;" },
              z.dominantLabel)),
          h("div.zone-card-foot", "Last trigger: ", App.dom.val(z.lastTrigger))
        );
      }).concat(showcaseTamperCard(panelTamper(zones))))
    );
  }

  function showcaseTamperCard(t) {
    var glow = t.label === "Normal"
      ? "border-color:" + t.color + "22;"
      : "border-color:" + t.color + "66;box-shadow:0 0 0 1px " + t.color +
        "40, 0 0 30px " + t.color + "40, 0 4px 16px rgba(0,0,0,.4);";
    return h(
      "div.zone-card.dark",
      { style: glow },
      h("div.zone-watermark.word", "TAMPER"),
      h("span.icon-chip", {
        style: "width:44px;height:44px;flex:0 0 44px;border-radius:12px;position:relative;z-index:1;" +
          "background:" + t.color + "22;color:" + t.color + ";border-color:" + t.color + "55;",
        html: App.ICONS.tamperLg,
      }),
      h("div.zone-card-name", t.name),
      h("div", { style: "margin-top:8px;position:relative;z-index:1;" },
        h("span.badge", { style: u.badgeStyle(t.color) + "font-size:12px;padding:4px 12px;" }, t.label)),
      h("div.zone-card-foot", t.detail, " · ", App.dom.val(t.lastTrigger))
    );
  }

  function tableView(branch, zones) {
    return h(
      "div.card",
      { style: "overflow:hidden;" },
      W.listHeader({
        iconHtml: App.ICONS.branches,
        title: branch.name,
        subtitle: branch.district + " · 8-zone + tamper panel detail",
        controls: h("div.flex.gap-8",
          W.panelBadge(branch.panelStatus), W.connBadge(branch.connectivity)),
      }),
      h("div.table-scroll", W.dataTable([
        { label: "Zone Name", key: "name", className: "name" },
        { label: "Zone Status", render: function (z) { return badge(z.status, z.statusColor); } },
        { label: "Alarm / Normal", render: function (z) { return badge(z.condition, z.conditionColor); } },
        { label: "Fault", render: function (z) { return badge(z.fault, z.faultColor); } },
        { label: "Tamper", render: function (z) { return badge(z.tamper, z.tamperColor); } },
        { label: "Last Trigger Time", key: "lastTrigger", className: "mono" },
      ], zones.concat(tamperRow(zones))))
    );
  }

  /* The tamper circuit as a ninth table row, shaped like a zone row. It is
     supervised around the clock, so it stays Active when the panel is
     disarmed and only goes Unknown when the panel is offline. */
  function tamperRow(zones) {
    var t = panelTamper(zones);
    var tripped = t.label === "Tamper";
    var offline = zones.length && zones[0].status === "Unknown";
    return {
      name: tripped ? "Tamper (" + t.detail + ")" : "Tamper",
      status: offline ? "Unknown" : "Active",
      statusColor: offline ? COLORS.slate : COLORS.green,
      condition: t.label,
      conditionColor: t.color,
      fault: "--",
      faultColor: COLORS.grey,
      tamper: tripped ? "Tamper" : "OK",
      tamperColor: t.color,
      lastTrigger: t.lastTrigger,
    };
  }

  function render(ctx) {
    var fallback = defaultBranch();
    var branch = App.data.branchById(ctx.state.zoneSelectedBranchId) || fallback;
    var zones = App.data.zonesFor(branch);
    var mode = ctx.state.zoneViewMode || "showcase";

    var detail = mode === "grand" ? grandView(branch, zones)
      : mode === "table" ? tableView(branch, zones)
      : showcaseView(branch, zones);

    return h("div", picker(ctx, branch.id), detail);
  }

  App.views = App.views || {};
  App.views.zoneStatus = {
    label: "Zone Status",
    icon: "zones",
    title: "Zone Status",
    subtitle: "8-zone + tamper panel detail per branch",
    render: render,
  };
})(window.App = window.App || {});
