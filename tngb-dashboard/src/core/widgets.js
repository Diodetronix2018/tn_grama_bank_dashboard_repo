/* Reusable building blocks shared by more than one view. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var badge = App.dom.badge;
  var iconChip = App.dom.iconChip;
  var u = App.utils;

  /* A KPI tile. Pass `onClick` to make it a drill-down. */
  function kpiCard(opts) {
    var classes = ["kpi"];
    if (opts.compact) classes.push("compact");
    if (opts.onClick) classes.push("is-clickable");
    if (opts.selected) classes.push("is-selected");

    return h(
      "button." + classes.join("."),
      { type: "button", onclick: opts.onClick || null, disabled: !opts.onClick },
      h("span.kpi-rail", { style: "background:" + opts.color + ";" }),
      iconChip(opts.iconHtml, opts.color, { solid: true, class: opts.compact ? "sm" : "" }),
      h("div.kpi-label", opts.label),
      h("div.kpi-value" + (opts.compact ? ".sm" : ""), String(opts.value)),
      opts.hint ? h("div.kpi-hint", opts.hint) : null
    );
  }

  /* A row of KPI tiles. */
  function kpiRow(cards, columns) {
    return h(
      "div.grid.gap-sm.grid-" + (columns || 4),
      cards.map(function (c) { return kpiCard(c); })
    );
  }

  /* Debounced-free search box that keeps focus across re-renders by carrying
     a stable id the renderer restores after each paint. */
  function searchInput(opts) {
    return h("input.text-input", {
      type: "search",
      id: opts.id,
      value: opts.value || "",
      placeholder: opts.placeholder || "Search",
      style: opts.width ? "width:" + opts.width + ";" : "",
      oninput: function (e) { opts.onInput(e.target.value); },
    });
  }

  /* A table with a sticky header. `columns` entries:
       { label, key, align, render(row), className } */
  function dataTable(columns, rows, opts) {
    opts = opts || {};
    return h(
      "table.data",
      h("thead", h("tr", columns.map(function (c) {
        return h("th" + (c.align === "right" ? ".num" : c.align === "center" ? ".mid" : ""), c.label);
      }))),
      h("tbody", rows.map(function (row, i) {
        var onClick = opts.onRowClick ? function () { opts.onRowClick(row, i); } : null;
        return h(
          "tr" + (onClick ? ".is-clickable" : ""),
          onClick ? { onclick: onClick } : {},
          columns.map(function (c) {
            var cls = "td" +
              (c.align === "right" ? ".num" : c.align === "center" ? ".mid" : "") +
              (c.className ? "." + c.className : "");
            var content = c.render ? c.render(row) : row[c.key];
            var props = c.style ? { style: c.style(row) } : {};
            return h(cls, props, content);
          })
        );
      }))
    );
  }

  /* The drill-down panel that opens under a KPI row. */
  function filterPanel(opts) {
    return h(
      "div.card.mb-lg",
      { style: "overflow:hidden;" },
      h(
        "div.card-head",
        h(
          "div",
          h("div.card-title", opts.title, " ", h("span.muted-count", "(" + opts.count + ")")),
          opts.subtitle ? h("div.card-sub", opts.subtitle) : null
        ),
        h("button.close-btn", { type: "button", onclick: opts.onClose }, "Close ✕")
      ),
      h(
        "div.table-scroll",
        { style: "max-height:" + (opts.maxHeight || 380) + "px;" },
        dataTable(opts.columns, opts.rows, { onRowClick: opts.onRowClick })
      )
    );
  }

  /* A filter chip row driven by a counts map. */
  function chipRow(opts) {
    var chips = opts.types.map(function (t) {
      var color = opts.colors[t];
      var isActive = opts.active === t;
      var style = opts.dark
        ? "background:" + (isActive ? color + "2a" : "rgba(255,255,255,.06)") +
          ";border-color:" + (isActive ? color + "70" : "rgba(255,255,255,.1)") +
          ";color:" + (isActive ? "#ffffff" : "rgba(255,255,255,.7)") + ";"
        : "background:" + (isActive ? color + "18" : "") +
          ";border-color:" + (isActive ? color + "50" : "") +
          ";color:" + (isActive ? color : "") + ";";

      return h(
        "button.chip" + (opts.dark ? ".dark" : ""),
        { type: "button", style: style, onclick: function () { opts.onPick(t); } },
        h("span.dot", { style: "background:" + color + ";" }),
        h("span", t),
        h("span.chip-count", String(opts.counts[t] || 0))
      );
    });

    if (opts.active) {
      chips.push(h(
        "button.close-btn",
        {
          type: "button",
          style: opts.dark ? "background:rgba(255,255,255,.08);color:rgba(255,255,255,.7);" : "",
          onclick: opts.onClear,
        },
        "Clear filter ✕"
      ));
    }

    return h("div" + (opts.dark ? ".command-chips" : ".chip-row"), chips);
  }

  /* Header block used by list cards: icon, title, count, subtitle, controls. */
  function listHeader(opts) {
    return h(
      "div.card-head",
      h(
        "div.flex-center",
        opts.iconHtml ? iconChip(opts.iconHtml, opts.color || u.COLORS.navy, { size: 36, radius: 10 }) : null,
        h(
          "div",
          h("div.card-title", opts.title, opts.count !== undefined
            ? [" ", h("span.muted-count", "(" + opts.count + ")")] : null),
          opts.subtitle ? h("div.card-sub", opts.subtitle) : null
        )
      ),
      opts.controls || null
    );
  }

  /* Segmented view-mode switch. */
  function segmented(options, active, onPick) {
    return h("div.segmented", options.map(function (o) {
      return h(
        "button" + (o.key === active ? ".is-active" : ""),
        { type: "button", onclick: function () { onPick(o.key); } },
        o.label
      );
    }));
  }

  /* Small summary tiles used at the top of secondary views. */
  function summaryCards(cards, columns) {
    return h("div.grid.gap-sm.grid-" + (columns || 3) + ".mb-lg", cards.map(function (c) {
      return h(
        "div.kpi.compact",
        h("span.kpi-rail", { style: "background:" + c.color + ";" }),
        c.iconHtml ? iconChip(c.iconHtml, c.color, { solid: true, class: "sm" }) : null,
        h("div.kpi-label", c.label),
        h("div.kpi-value.sm", String(c.value))
      );
    }));
  }

  /* Status badge helpers, so colour rules live in exactly one place. */
  function panelBadge(status, extraClass) {
    return badge(status, u.panelStatusColor(status), extraClass);
  }

  function connBadge(conn, extraClass) {
    return badge(conn, u.connectivityColor(conn), extraClass);
  }

  App.widgets = {
    kpiCard: kpiCard,
    kpiRow: kpiRow,
    searchInput: searchInput,
    dataTable: dataTable,
    filterPanel: filterPanel,
    chipRow: chipRow,
    listHeader: listHeader,
    segmented: segmented,
    summaryCards: summaryCards,
    panelBadge: panelBadge,
    connBadge: connBadge,
  };
})(window.App = window.App || {});
