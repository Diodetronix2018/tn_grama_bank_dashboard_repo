/* Reports: ten canned reports over the same event store, each exportable
   as CSV. Report definitions live in src/data/derived.js. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var badge = App.dom.badge;
  var iconChip = App.dom.iconChip;
  var W = App.widgets;
  var u = App.utils;
  var COLORS = u.COLORS;

  var ROW_LIMIT = 400;

  /* The most recent day present in the log; every range is measured from it. */
  function latestDate(events) {
    return events.reduce(function (acc, e) {
      var d = e.time.slice(0, 10);
      return d > acc ? d : acc;
    }, events.length ? events[0].time.slice(0, 10) : App.data.TODAY);
  }

  /* Calendar arithmetic in UTC: a local-midnight Date read back through
     toISOString() lands on the previous day east of Greenwich (e.g. IST). */
  function shiftDays(dateStr, delta) {
    var d = new Date(dateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  function scopeEvents(def, all) {
    var latest = latestDate(all);
    var rows = all;
    if (def.range === "today") {
      rows = rows.filter(function (e) { return e.time.slice(0, 10) === latest; });
    } else if (def.range === "week") {
      var from = shiftDays(latest, -6);
      rows = rows.filter(function (e) { return e.time.slice(0, 10) >= from; });
    } else if (def.range === "month") {
      rows = rows.filter(function (e) { return e.time.slice(0, 7) === latest.slice(0, 7); });
    }
    if (def.types) {
      rows = rows.filter(function (e) { return def.types.indexOf(e.type) !== -1; });
    }
    return rows;
  }

  /* Per-branch event tallies for the branch-wise report. */
  function branchRollup(all) {
    var byBranch = {};
    all.forEach(function (e) {
      var c = byBranch[e.branchId] ||
        (byBranch[e.branchId] = { total: 0, alarm: 0, fault: 0, tamper: 0 });
      c.total++;
      if (e.type === "Alarm") c.alarm++;
      else if (e.type === "Fault") c.fault++;
      else if (e.type === "Tamper Activate") c.tamper++;
    });

    return App.data.allBranches().map(function (b) {
      var c = byBranch[b.id] || { total: 0, alarm: 0, fault: 0, tamper: 0 };
      return {
        name: b.name, district: b.district, status: b.status,
        total: c.total, alarm: c.alarm, fault: c.fault, tamper: c.tamper,
      };
    }).sort(function (a, b) { return b.total - a.total; });
  }

  /* Text starting with = + - @ (or a tab/CR) would run as a formula when
     the CSV is opened in Excel, so it is prefixed with ' to stay plain text. */
  function csvCell(value) {
    var s = value === null || value === undefined ? "" : String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadCsv(filename, header, rows) {
    var lines = [header.join(",")];
    rows.forEach(function (r) { lines.push(r.map(csvCell).join(",")); });
    var blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoking in the same tick can cancel the download in some browsers.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function render(ctx) {
    var defs = App.data.REPORT_DEFS;
    var activeKey = ctx.state.reportType || defs[0].key;
    var def = defs.find(function (d) { return d.key === activeKey; }) || defs[0];
    var all = App.data.allEvents();
    var isBranchwise = def.scope === "branchwise";

    var branchRows = isBranchwise ? branchRollup(all) : [];
    var eventRows = isBranchwise ? [] : scopeEvents(def, all);

    var rail = h("div.report-rail", defs.map(function (d) {
      return h(
        "button.report-item" + (d.key === activeKey ? ".is-active" : ""),
        { type: "button", onclick: function () { ctx.setState({ reportType: d.key }); } },
        iconChip(App.ICONS[d.icon], d.color, { class: "sm" }),
        h("div", { style: "min-width:0;" },
          h("div.report-item-label", d.label),
          h("div.report-item-desc", d.desc))
      );
    }));

    var exportRows = isBranchwise
      ? branchRows.map(function (r) {
          return [r.name, r.district, r.total, r.alarm, r.fault, r.tamper, r.status];
        })
      : eventRows.map(function (e) {
          return [e.time, e.branch, e.district, e.type, e.zone || ""];
        });
    var exportHeader = isBranchwise
      ? ["Branch", "District", "Total Events", "Alarm", "Fault", "Tamper", "Status"]
      : ["Time", "Branch", "District", "Event", "Zone"];

    var toolbar = h(
      "div.card",
      { style: "padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;" },
      h("div",
        h("div.report-title", def.label),
        h("div.report-desc", def.desc)),
      h(
        "div.flex-center",
        { style: "gap:14px;" },
        h("div.report-stamp", "Generated ",
          App.dom.val(latestDate(all) + " " + u.fmtClock(ctx.state.now).slice(0, 5))),
        h("button.btn-primary", {
          type: "button",
          onclick: function () {
            downloadCsv(def.key + "-report.csv", exportHeader, exportRows);
          },
        }, h("span", { html: App.ICONS.download, style: "display:flex;" }), "Download CSV")
      )
    );

    var summary = isBranchwise
      ? [
          { label: "Branches Covered", value: branchRows.length, color: COLORS.navy },
          {
            label: "Branches Needing Attention",
            value: branchRows.filter(function (r) { return r.status === "Attention"; }).length,
            color: COLORS.amber,
          },
          {
            label: "Total Events Logged",
            value: branchRows.reduce(function (s, r) { return s + r.total; }, 0),
            color: COLORS.navy,
          },
        ]
      : [
          { label: "Total Records", value: eventRows.length, color: def.color },
          {
            label: "Branches Involved",
            value: new Set(eventRows.map(function (e) { return e.branchId; })).size,
            color: COLORS.navy,
          },
          {
            label: "Districts Involved",
            value: new Set(eventRows.map(function (e) { return e.district; })).size,
            color: COLORS.navy,
          },
        ];

    var table = isBranchwise
      ? W.dataTable([
          { label: "Branch", key: "name", className: "name" },
          { label: "District", key: "district", className: "sub" },
          { label: "Total Events", key: "total", align: "right", className: "name" },
          {
            label: "Alarm", align: "right",
            render: function (r) { return h("span.val", { style: "color:" + COLORS.red + ";" }, String(r.alarm)); },
          },
          {
            label: "Fault", align: "right",
            render: function (r) { return h("span.val", { style: "color:" + COLORS.amber + ";" }, String(r.fault)); },
          },
          {
            label: "Tamper", align: "right",
            render: function (r) { return h("span.val", { style: "color:" + COLORS.orange + ";" }, String(r.tamper)); },
          },
          {
            label: "Status",
            render: function (r) {
              return badge(r.status, r.status === "Attention" ? COLORS.amber : COLORS.green);
            },
          },
        ], branchRows.slice(0, ROW_LIMIT))
      : W.dataTable([
          { label: "Time", key: "time", className: "mono" },
          { label: "Branch", key: "branch", className: "name" },
          { label: "District", key: "district", className: "sub" },
          { label: "Event", render: function (e) { return badge(e.type, App.data.EVENT_COLORS[e.type]); } },
          { label: "Zone", className: "sub", render: function (e) { return e.zone || "--"; } },
        ], eventRows.slice(0, ROW_LIMIT));

    var totalCount = isBranchwise ? branchRows.length : eventRows.length;

    var body = h(
      "div.flex-col",
      { style: "gap:16px;min-width:0;" },
      toolbar,
      h("div.grid.gap-sm.grid-3", summary.map(function (c) {
        return h("div.kpi.compact",
          h("span.kpi-rail", { style: "background:" + c.color + ";" }),
          h("div.kpi-label", { style: "margin-top:0;" }, c.label),
          h("div.kpi-value.sm", { style: "color:" + c.color + ";" }, String(c.value)));
      })),
      h(
        "div.card",
        { style: "overflow:hidden;" },
        h("div.card-head",
          h("div.card-title", isBranchwise ? "Branch-wise Breakdown" : "Event Records", " ",
            h("span.muted-count", "(" + totalCount + ")"))),
        totalCount
          ? h("div.table-scroll", { style: "max-height:520px;" }, table)
          : h("div", { style: "padding:40px;text-align:center;color:var(--ink-soft);" },
              "No records fall inside this report's range."),
        totalCount > ROW_LIMIT
          ? h("div", {
              style: "padding:12px 22px;border-top:1px solid var(--line-faint);" +
                "font-size:11.5px;color:var(--ink-faint);",
            }, "Preview shows the first ", App.dom.val(ROW_LIMIT), " rows. The CSV export contains all ",
               App.dom.val(totalCount), ".")
          : null
      )
    );

    return h("div.grid.split", { style: "grid-template-columns:250px minmax(0,1fr);" }, rail, body);
  }

  App.views = App.views || {};
  App.views.reports = {
    label: "Reports",
    icon: "reports",
    title: "Reports",
    subtitle: "Scheduled and on-demand reports",
    render: render,
  };
})(window.App = window.App || {});
