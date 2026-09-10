/* Location Maps: every district plotted by its centroid, sized by branch
   count and coloured by whether it needs attention. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var u = App.utils;
  var COLORS = u.COLORS;
  var SVG_NS = "http://www.w3.org/2000/svg";

  /* Bounds that comfortably contain mainland Tamil Nadu. */
  var BOUNDS = { latMin: 7.9, latMax: 13.7, lonMin: 76.1, lonMax: 80.5 };
  var VIEW = { w: 880, h: 1000, pad: 42 };

  function project(coords) {
    var innerW = VIEW.w - VIEW.pad * 2;
    var innerH = VIEW.h - VIEW.pad * 2;
    var x = VIEW.pad + ((coords[1] - BOUNDS.lonMin) / (BOUNDS.lonMax - BOUNDS.lonMin)) * innerW;
    var y = VIEW.pad + ((BOUNDS.latMax - coords[0]) / (BOUNDS.latMax - BOUNDS.latMin)) * innerH;
    return { x: x, y: y };
  }

  function el(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  /* Three severity tiers. A flat normal/abnormal split would paint almost
     every district amber, because 50 alarms and 20 faults spread thinly
     across 38 districts - the tiers keep the map worth reading. */
  var TIERS = [
    { key: "critical", label: "2 or more alarms", color: COLORS.red, test: function (s) { return s.alarm >= 2; } },
    { key: "watch", label: "1 alarm or any fault", color: COLORS.amber, test: function (s) { return s.alarm > 0 || s.fault > 0; } },
    { key: "clear", label: "No alarm or fault", color: COLORS.green, test: function () { return true; } },
  ];

  function districtPoints() {
    return App.data.REGIONS.map(function (r) {
      var s = App.data.districtStats(r.name);
      var tier = TIERS.find(function (t) { return t.test(s); });
      return {
        name: r.name,
        stats: s,
        pos: project(r.coords),
        radius: 9 + Math.min(r.branchCount, 40) * 0.42,
        color: tier.color,
        tier: tier.key,
        highlight: tier.key !== "clear",
      };
    });
  }

  function buildMap(ctx, points) {
    var wrap = h("div.map-wrap");
    var tooltip = h("div.map-tooltip");

    var svg = el("svg", {
      class: "map-svg",
      viewBox: "0 0 " + VIEW.w + " " + VIEW.h,
      preserveAspectRatio: "xMidYMid meet",
    });

    /* A faint graticule so the pins read as a map rather than a scatter. */
    var grid = el("g", { opacity: "0.5" });
    for (var lon = 77; lon <= 80; lon++) {
      var gx = project([BOUNDS.latMax, lon]).x;
      grid.appendChild(el("line", {
        x1: gx, y1: VIEW.pad, x2: gx, y2: VIEW.h - VIEW.pad,
        stroke: "#dce3ee", "stroke-width": 1, "stroke-dasharray": "4 6",
      }));
    }
    for (var lat = 8; lat <= 13; lat++) {
      var gy = project([lat, BOUNDS.lonMin]).y;
      grid.appendChild(el("line", {
        x1: VIEW.pad, y1: gy, x2: VIEW.w - VIEW.pad, y2: gy,
        stroke: "#dce3ee", "stroke-width": 1, "stroke-dasharray": "4 6",
      }));
    }
    svg.appendChild(grid);

    /* District centroids sit close together in the north-east, so a label is
       dropped when it would collide with one already placed. The pin stays,
       and hovering still names it. */
    var overlaps = function (a, b) {
      return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
    };

    /* Labels must clear both the other labels and every pin, so start the
       occupied list with the circles themselves. */
    var blocked = points.map(function (p) {
      return {
        owner: p.name,
        x1: p.pos.x - p.radius, x2: p.pos.x + p.radius,
        y1: p.pos.y - p.radius, y2: p.pos.y + p.radius,
      };
    });

    function labelFits(p) {
      var box = {
        owner: p.name,
        x1: p.pos.x - p.name.length * 3.2,
        x2: p.pos.x + p.name.length * 3.2,
        y1: p.pos.y + p.radius + 4,
        y2: p.pos.y + p.radius + 17,
      };
      var clash = blocked.some(function (b) {
        return b.owner !== p.name && overlaps(box, b);
      });
      if (!clash) blocked.push(box);
      return !clash;
    }

    /* Largest pins first, so small ones stay clickable on top. */
    points.slice().sort(function (a, b) { return b.radius - a.radius; }).forEach(function (p) {
      var group = el("g", { class: "map-pin" });

      if (p.highlight) {
        group.appendChild(el("circle", {
          cx: p.pos.x, cy: p.pos.y, r: p.radius + 6,
          fill: p.color, opacity: "0.14",
        }));
      }

      group.appendChild(el("circle", {
        cx: p.pos.x, cy: p.pos.y, r: p.radius,
        fill: p.color, "fill-opacity": "0.85",
        stroke: "#ffffff", "stroke-width": 1.5,
      }));

      if (labelFits(p)) {
        var label = el("text", {
          x: p.pos.x, y: p.pos.y + p.radius + 13,
          "text-anchor": "middle",
          "font-size": "11",
          "font-weight": "600",
          fill: "#334155",
          stroke: "#f2f5fa",
          "stroke-width": "3.5",
          "paint-order": "stroke",
        });
        label.textContent = p.name;
        group.appendChild(label);
      }

      var count = el("text", {
        x: p.pos.x, y: p.pos.y + 3.5,
        "text-anchor": "middle",
        "font-size": "10",
        "font-weight": "700",
        fill: "#ffffff",
      });
      count.textContent = String(p.stats.total);
      group.appendChild(count);

      group.addEventListener("mousemove", function (e) {
        var rect = wrap.getBoundingClientRect();
        tooltip.innerHTML =
          "<b>" + p.name + "</b><br>" +
          p.stats.total + " branches · " + p.stats.online + " online<br>" +
          p.stats.offline + " offline · " + p.stats.alarm + " alarm · " + p.stats.fault + " fault";
        tooltip.style.left = e.clientX - rect.left + "px";
        tooltip.style.top = e.clientY - rect.top + "px";
        tooltip.classList.add("is-visible");
      });
      group.addEventListener("mouseleave", function () {
        tooltip.classList.remove("is-visible");
      });
      group.addEventListener("click", function () {
        ctx.setState({ selectedRegion: p.name, selectedBranchId: null });
        ctx.go("overview");
      });

      svg.appendChild(group);
    });

    wrap.appendChild(svg);
    wrap.appendChild(tooltip);
    return wrap;
  }

  function render(ctx) {
    var stats = App.data.networkStats();
    var points = districtPoints();
    var normalPct = Math.round((stats.normal / (stats.totalBranches || 1)) * 100);
    var attention = points.filter(function (p) { return p.highlight; })
      .sort(function (a, b) {
        return (b.stats.alarm * 10 + b.stats.fault) - (a.stats.alarm * 10 + a.stats.fault);
      });

    var legend = h(
      "div.card",
      { style: "padding:16px;" },
      h("div.card-title", { style: "font-size:13px;margin-bottom:10px;" }, "Legend"),
      h("div.flex-col", { style: "gap:8px;" }, TIERS.map(function (t) {
        return h("div.flex-center",
          h("span.dot.lg", { style: "background:" + t.color + ";" }),
          h("span", { style: "font-size:12px;color:var(--ink-muted);" }, t.label));
      })),
      h("div", {
        style: "font-size:10.5px;color:var(--ink-faint);margin-top:10px;line-height:1.6;",
      }, "Pin size scales with branch count and the number inside it is that count. " +
         "Hover for the offline / alarm / fault breakdown, click to open the district.")
    );

    var headline = h(
      "div.card",
      { style: "padding:16px;" },
      h("div.card-title", { style: "font-size:13px;margin-bottom:4px;" }, normalPct + "% Normal"),
      h("div", { style: "font-size:11.5px;color:var(--ink-soft);" },
        "Across " + stats.totalDistricts + " districts and " +
        stats.totalBranches + " branches network-wide.")
    );

    var watchlist = h(
      "div.card",
      { style: "padding:16px;min-height:0;" },
      h("div.card-title", { style: "font-size:13px;margin-bottom:10px;" },
        "Open Incidents by District ", h("span.muted-count", "(" + attention.length + ")")),
      h("div.list-scroll", { style: "max-height:280px;" }, attention.map(function (p) {
        return h(
          "button.row-item",
          {
            type: "button",
            onclick: function () {
              ctx.setState({ selectedRegion: p.name, selectedBranchId: null });
              ctx.go("overview");
            },
          },
          h("div",
            h("div.row-item-name", p.name),
            h("div.row-item-sub",
              p.stats.alarm + " alarm · " + p.stats.fault + " fault · " + p.stats.offline + " offline")),
          App.dom.badge(String(p.stats.total), COLORS.navy)
        );
      }))
    );


    /* The map column is capped near the projection's own aspect ratio, so the
       drawing fills its card instead of floating in white space. */
    return h(
      "div.grid",
      { style: "grid-template-columns:minmax(0,760px) minmax(280px,1fr);align-items:start;" },
      buildMap(ctx, points),
      h("div.flex-col", { style: "gap:12px;" }, legend, headline, watchlist)
    );
  }

  App.views = App.views || {};
  App.views.locationMaps = {
    label: "Location Maps",
    icon: "map",
    title: "Location Maps",
    subtitle: "Geographic branch view",
    render: render,
  };
})(window.App = window.App || {});
