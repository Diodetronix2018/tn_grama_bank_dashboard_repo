/* System Setting: a section rail (same pattern as Reports) over setting
   cards. Every control here either takes effect immediately (display
   preferences, via App.prefs) or is shown read-only with where it is really
   configured -- nothing on this screen pretends to change the server. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var W = App.widgets;

  var SECTIONS = [
    { key: "general", label: "General", desc: "Region, time and data feed", icon: "settings" },
    { key: "appearance", label: "Appearance", desc: "Theme, accent and layout", icon: "overview" },
    { key: "access", label: "Users & Access", desc: "Roles and sign-in security", icon: "lockClosed" },
    { key: "support", label: "Support", desc: "Helpdesk, tickets and guides", icon: "bell" },
    { key: "about", label: "About", desc: "System and deployment details", icon: "info" },
  ];

  var THEMES = [
    { key: "light", label: "Light", available: true, bg: "#f5f7fa", side: "#fff", bar: "var(--navy)", card: "#fff" },
    { key: "dark", label: "Dark", available: false, bg: "#0b1220", side: "#111a2e", bar: "#6d8bff", card: "#1a2438" },
    { key: "system", label: "Match system", available: false, bg: "linear-gradient(90deg,#f5f7fa 50%,#0b1220 50%)",
      side: "#e6e9ef", bar: "var(--navy)", card: "rgba(255,255,255,.55)" },
  ];

  var ACCENTS = [["#002172", "Navy"], ["#0f766e", "Teal"], ["#7c2d12", "Rust"], ["#334155", "Slate"]];

  var ROLES = [
    { role: "Head Office Admin", view: true, ack: true, configure: true, export: true },
    { role: "Regional Manager", view: true, ack: true, configure: false, export: true },
    { role: "Branch Manager", view: true, ack: true, configure: false, export: false },
    { role: "Viewer", view: true, ack: false, configure: false, export: false },
  ];

  // Replace with the bank's real helpdesk details before go-live.
  var CONTACTS = [
    { title: "Security Operations Centre", hours: "24 × 7", desc: "Live alarms, false alarms and branch emergencies",
      phone: "1800 000 0000", email: "soc@tngb.example" },
    { title: "Panel Vendor / AMC", hours: "Mon–Sat, 9–18", desc: "Hardware faults, sensor replacement, site visits",
      phone: "1800 000 0001", email: "amc@vendor.example" },
  ];

  // Set each url once the document is published; until then it shows as pending.
  var DOCS = [
    { title: "Operator user manual", kind: "PDF", url: "" },
    { title: "Branch arming / disarming guide", kind: "PDF", url: "" },
    { title: "Alarm response SOP", kind: "PDF", url: "" },
    { title: "Frequently asked questions", kind: "Web", url: "" },
  ];

  var TICKET_CATEGORIES = ["Panel / Hardware", "False alarm", "Connectivity", "Dashboard access", "Other"];
  var TICKET_PRIORITIES = ["Low", "Medium", "High"];

  /* Screen-local UI state. Kept out of app state because nothing else reads
     it, and out of storage because a half-written ticket shouldn't outlive
     the visit. */
  var ui = {
    section: "general",
    saved: null, // { ok: bool, at: Date } after the last preference change
    ticket: freshTicket(),
    ticketErrors: {},
    ticketSent: null, // the mailto subject once the email app was opened
  };

  function freshTicket() {
    return { category: TICKET_CATEGORIES[0], branch: "", priority: "Medium", desc: "" };
  }

  /* ---- Building blocks -------------------------------------------------- */

  function section(title, sub, body, opts) {
    opts = opts || {};
    return h("div.card" + (opts.className ? "." + opts.className : ""),
      h("div.card-head",
        h("div", h("div.card-title", title), sub ? h("div.card-sub", sub) : null),
        opts.aside || null),
      h("div" + (opts.flush ? "" : ".ss-body"), body));
  }

  function row(label, desc, control) {
    return h("div.ss-row",
      h("div.ss-row-text", h("div.ss-rl", label), desc ? h("div.ss-rd", desc) : null),
      h("div.ss-row-control", control));
  }

  function value(text, tone) {
    return h("span.ss-value" + (tone ? ".is-" + tone : ""), text);
  }

  function tag(text) {
    return h("span.ss-tag", text);
  }

  /* The shared .segmented control, plus disabled options for things that
     aren't built yet. */
  function segmented(options, active, onPick) {
    return h("div.segmented.ss-segmented", { role: "radiogroup" }, options.map(function (o) {
      var on = o.key === active;
      return h("button" + (on ? ".is-active" : ""), {
        type: "button", role: "radio", "aria-checked": String(on),
        disabled: o.disabled, title: o.disabled ? o.disabled : null,
        onclick: function () { onPick(o.key); },
      }, o.label);
    }));
  }

  function toggle(on, label, onFlip) {
    return h("button.ss-toggle" + (on ? ".on" : ""), {
      type: "button", role: "switch", "aria-checked": String(on), "aria-label": label,
      onclick: onFlip,
    }, h("i"));
  }

  function setPref(ctx, key, val, patch) {
    ui.saved = { ok: App.prefs.set(key, val), at: new Date() };
    ctx.setState(patch || {});
  }

  function feedStatus(ctx) {
    var s = ctx.state;
    if (!App.data.load) return { text: "Sample data (offline copy)", tone: "muted" };
    if (s.refreshError) return { text: "Delayed — last good data at " + App.prefs.fmtClock(s.lastUpdated), tone: "warn" };
    if (s.lastUpdated) return { text: "Live — updated " + App.prefs.fmtClock(s.lastUpdated), tone: "ok" };
    return { text: "Connecting…", tone: "muted" };
  }

  /* ---- General ---------------------------------------------------------- */

  function durationLabel(ms) {
    return ms < 60000 ? ms / 1000 + " seconds" : ms / 60000 + (ms === 60000 ? " minute" : " minutes");
  }

  /* A native select over one of App.prefs' fixed CHOICES lists. */
  function prefSelect(ctx, key, label, fmt, onChanged) {
    var current = App.prefs.get(key);
    return h("select.text-input.ss-select", {
      id: "ss-" + key, "aria-label": label,
      onchange: function (e) {
        var next = Number(e.target.value);
        setPref(ctx, key, next);
        if (onChanged) onChanged(next);
      },
    }, App.prefs.CHOICES[key].map(function (v) {
      return h("option", { value: String(v), selected: v === current ? "selected" : null },
        fmt(v) + (v === App.prefs.DEFAULTS[key] ? " (default)" : ""));
    }));
  }

  function generalPanel(ctx) {
    var live = !!App.data.load;
    var signedIn = !!(App.auth && ctx.state.userEmail);
    var feed = feedStatus(ctx);
    return [
      section("Regional", "Language and how times are shown", [
        row("Language", "Interface language",
          segmented([
            { key: "en", label: "English" },
            { key: "ta", label: "தமிழ்", disabled: "Tamil interface is not available yet" },
          ], "en", function () {})),
        row("Time zone", "Every branch timestamp is recorded in this zone",
          value("India Standard Time (UTC+5:30)")),
        row("Clock format", "Header clock and last-updated time; reports stay 24-hour",
          segmented([{ key: "24h", label: "24-hour" }, { key: "12h", label: "12-hour" }],
            App.prefs.get("clock"), function (k) { setPref(ctx, "clock", k); })),
      ]),
      section("Data & Session", "How often branch status updates, and when an idle session ends", [
        row("Source", null,
          value(live ? "Live branch data service" : "Built-in sample data")),
        row("Auto-refresh interval",
          "New sensor readings arrive about every 5 minutes." +
            (live ? "" : " Takes effect when connected to the live feed."),
          prefSelect(ctx, "refreshMs", "Auto-refresh interval", function (ms) { return "Every " + durationLabel(ms); },
            function () { if (App.data.restartPolling) App.data.restartPolling(); })),
        row("Feed status", null, value(feed.text, feed.tone)),
        row("Session timeout",
          "Signs out when idle, after a 1-minute warning. Sessions also end 30 minutes after sign-in." +
            (signedIn ? "" : " Applies while signed in."),
          prefSelect(ctx, "idleTimeoutMin", "Session timeout", function (m) { return m + " minutes idle"; })),
      ]),
    ];
  }

  /* ---- Appearance ------------------------------------------------------- */

  /* What "Reset to defaults" on this tab covers -- not General's settings. */
  var APPEARANCE_KEYS = ["accent", "density", "badgeStyle", "fontScale", "liveView", "sidebarCollapsed", "reduceMotion"];

  function appearancePanel(ctx) {
    var scale = App.prefs.get("fontScale");
    var scaleLabel = h("span.ss-scale-label", scale + "%");
    var accent = App.prefs.get("accent");

    return [
      section("Theme", "Colour scheme for the dashboard",
        h("div.ss-themes", THEMES.map(function (t) {
          var on = t.key === "light";
          return h("button.ss-theme" + (on ? ".on" : ""), {
            type: "button", disabled: !t.available, "aria-pressed": String(on),
            title: t.available ? null : t.label + " theme is not available yet",
          },
          h("div.ss-preview", { style: "background:" + t.bg },
            h("div.ss-preview-side", { style: "background:" + t.side }),
            h("div.ss-preview-main",
              h("div.ss-preview-bar", { style: "background:" + t.bar }),
              h("div.ss-preview-cards",
                h("div", { style: "background:" + t.card }),
                h("div", { style: "background:" + t.card })))),
          h("div.ss-theme-foot",
            h("span", t.label),
            t.available ? h("span.ss-dot") : tag("Coming soon")));
        }))),

      section("Accent colour", "Buttons, active items and highlights across every screen",
        h("div.ss-accents", ACCENTS.map(function (a) {
          var on = accent === a[0];
          return h("button.ss-accent" + (on ? ".on" : ""), {
            type: "button", "aria-pressed": String(on),
            onclick: function () { setPref(ctx, "accent", a[0]); },
          }, h("b", { style: "background:" + a[0] + ";color:" + a[0] + ";" }), a[1]);
        }))),

      section("Layout", "Applies on this computer only", [
        row("Density", "Row height in tables",
          segmented([{ key: "comfortable", label: "Comfortable" }, { key: "compact", label: "Compact" }],
            App.prefs.get("density"), function (k) { setPref(ctx, "density", k); })),
        row("Status badges", "How statuses such as Armed or Alarm Active look in every table and list",
          h("div.ss-badge-pick",
            segmented([
              { key: "signal", label: "Signal" },
              { key: "tag", label: "Tag" },
              { key: "dot", label: "Dot" },
            ], App.prefs.get("badgeStyle"), function (k) { setPref(ctx, "badgeStyle", k); }),
            h("div.ss-badge-samples",
              App.dom.badge("Alarm Active", App.utils.COLORS.red),
              App.dom.badge("Fault", App.utils.COLORS.amber),
              App.dom.badge("Armed", App.utils.COLORS.navy),
              App.dom.badge("Normal", App.utils.COLORS.green)))),
        row("Text size", "Scales the main content area",
          h("div.ss-range",
            h("input", {
              type: "range", min: 90, max: 120, step: 5, value: scale, "aria-label": "Text size",
              /* Live preview while dragging without replacing the slider
                 under the pointer; the saved-state repaint waits for release. */
              oninput: function (e) {
                scaleLabel.textContent = e.target.value + "%";
                document.documentElement.style.setProperty("--ui-scale", String(e.target.value / 100));
              },
              onchange: function (e) { setPref(ctx, "fontScale", Number(e.target.value)); },
            }),
            scaleLabel)),
        row("Live Activities opens in", null,
          segmented([{ key: "command", label: "Command Center" }, { key: "classic", label: "Classic View" }],
            App.prefs.get("liveView"),
            function (k) { setPref(ctx, "liveView", k, { liveViewMode: k }); })),
        row("Collapse sidebar", "Icons only in the navigation rail",
          toggle(App.prefs.get("sidebarCollapsed"), "Collapse sidebar",
            function () { setPref(ctx, "sidebarCollapsed", !App.prefs.get("sidebarCollapsed")); })),
        row("Reduce motion", "Stop pulsing status animations",
          toggle(App.prefs.get("reduceMotion"), "Reduce motion",
            function () { setPref(ctx, "reduceMotion", !App.prefs.get("reduceMotion")); })),
      ], {
        aside: h("button.ss-btn-quiet", {
          type: "button", disabled: App.prefs.isDefault(APPEARANCE_KEYS),
          onclick: function () {
            App.prefs.reset(APPEARANCE_KEYS);
            ui.saved = { ok: true, at: new Date() };
            ctx.setState({ liveViewMode: App.prefs.get("liveView") });
          },
        }, "Reset to defaults"),
      }),
    ];
  }

  /* ---- Users & Access --------------------------------------------------- */

  function accessPanel(ctx) {
    var tick = function (allowed) {
      return h("span", { class: allowed ? "ss-yes" : "ss-no", "aria-label": allowed ? "Allowed" : "Not allowed" },
        allowed ? "✓" : "—");
    };
    return [
      section("Roles & Permissions", "Who can see and act on what",
        W.dataTable([
          { label: "Role", key: "role", className: "name" },
          { label: "View", align: "center", render: function (r) { return tick(r.view); } },
          { label: "Acknowledge", align: "center", render: function (r) { return tick(r.ack); } },
          { label: "Configure", align: "center", render: function (r) { return tick(r.configure); } },
          { label: "Export", align: "center", render: function (r) { return tick(r.export); } },
        ], ROLES), { flush: true }),

      section("Sign-in security", "Enforced by the identity service; changed by an administrator", [
        row("Signed in as", null, value(ctx.state.userEmail || "Not signed in (offline copy)")),
        row("Identity provider", null, value("AWS Cognito")),
        row("Two-factor authentication", "Required at sign-in for accounts that have it enrolled",
          value("Optional, per account")),
        row("Session length", "You are asked to sign in again after this, even when active",
          value("30 minutes (server default)")),
        row("Inactivity sign-out", "Set under General",
          value(App.prefs.get("idleTimeoutMin") + " minutes idle")),
        row("Forgotten password", null, value("Self-service reset by email code")),
      ], { aside: tag("Read only") }),
    ];
  }

  /* ---- Support ---------------------------------------------------------- */

  function contactCard(c) {
    return h("div.card.ss-contact",
      h("div.ss-contact-head",
        h("div.card-title", c.title),
        App.dom.badge(c.hours, App.utils.COLORS.green, "no-dot")),
      h("div.card-sub", c.desc),
      h("a.ss-kv", { href: "tel:" + c.phone.replace(/\s+/g, "") },
        h("span", "Phone"), h("span", c.phone)),
      h("a.ss-kv", { href: "mailto:" + c.email },
        h("span", "Email"), h("span", c.email)));
  }

  function findBranch(code) {
    code = code.trim().toUpperCase();
    return App.data.allBranches().find(function (b) { return b.branchIdCode === code; }) || null;
  }

  function submitTicket(ctx) {
    var t = ui.ticket;
    var errors = {};
    var branch = null;
    if (t.branch.trim()) {
      branch = findBranch(t.branch);
      if (!branch) errors.branch = "No branch has the code " + t.branch.trim().toUpperCase();
    }
    if (t.desc.trim().length < 10) errors.desc = "Describe the issue in a sentence or two";
    ui.ticketErrors = errors;
    if (Object.keys(errors).length) { ctx.setState({}); return; }

    var subject = "[" + t.priority + "] " + t.category +
      (branch ? " — " + branch.branchIdCode + " " + branch.name : "");
    var body = [
      "Category: " + t.category,
      "Priority: " + t.priority,
      "Branch: " + (branch ? branch.branchIdCode + " — " + branch.name + ", " + branch.district : "Not branch-specific"),
      "Raised by: " + (ctx.state.userEmail || "unknown"),
      "",
      t.desc.trim(),
    ].join("\n");

    // No ticketing API yet, so hand the ticket to the operator's email app.
    h("a", {
      href: "mailto:" + CONTACTS[0].email +
        "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body),
    }).click();
    ui.ticketSent = subject;
    ctx.setState({});
  }

  function ticketCard(ctx) {
    var t = ui.ticket;
    var err = ui.ticketErrors;

    if (ui.ticketSent) {
      return section("Raise a support ticket", "Sent by email to the Security Operations Centre",
        h("div.ss-success",
          h("div.ss-success-title", "Your email app should now be open"),
          h("p", "Check the message and press Send to raise “" + ui.ticketSent + "”. " +
            "If nothing opened, email ", App.dom.val(CONTACTS[0].email), " directly."),
          h("button.ss-link", {
            type: "button",
            onclick: function () {
              ui.ticket = freshTicket(); ui.ticketErrors = {}; ui.ticketSent = null;
              ctx.setState({});
            },
          }, "Raise another ticket")));
    }

    var branchMatch = t.branch.trim() && !err.branch ? findBranch(t.branch) : null;

    return section("Raise a support ticket", "Opens a pre-filled email to the Security Operations Centre",
      h("form.ss-form", {
        novalidate: "novalidate",
        onsubmit: function (e) { e.preventDefault(); submitTicket(ctx); },
      },
      h("div.ss-callout",
        h("span.ss-callout-icon", { html: App.ICONS.alerts }),
        h("span", "Active alarm or intruder? Call the SOC on ", App.dom.val(CONTACTS[0].phone), " now — don't wait on a ticket.")),
      h("div.ss-grid2",
        h("label.ss-field", h("span", "Category"),
          h("select.text-input", {
            id: "ss-ticket-category",
            onchange: function (e) { t.category = e.target.value; },
          }, TICKET_CATEGORIES.map(function (c) {
            return h("option", { selected: t.category === c ? "selected" : null }, c);
          }))),
        h("label.ss-field", h("span", "Branch code (optional)"),
          h("input.text-input" + (err.branch ? ".is-invalid" : ""), {
            type: "text", id: "ss-ticket-branch", value: t.branch, placeholder: "e.g. TNGB-2041",
            "aria-invalid": err.branch ? "true" : null,
            oninput: function (e) { t.branch = e.target.value; },
          }),
          err.branch ? h("small.ss-error", err.branch)
            : branchMatch ? h("small.ss-hint", branchMatch.name + ", " + branchMatch.district) : null)),
      h("div.ss-field", h("span", "Priority"),
        h("div", segmented(TICKET_PRIORITIES.map(function (p) { return { key: p, label: p }; }), t.priority,
          function (k) { t.priority = k; ctx.setState({}); }))),
      h("label.ss-field", h("span", "Description"),
        h("textarea.text-input" + (err.desc ? ".is-invalid" : ""), {
          id: "ss-ticket-desc", rows: 4, value: t.desc, placeholder: "What happened, when, and what you have tried",
          "aria-invalid": err.desc ? "true" : null,
          oninput: function (e) { t.desc = e.target.value; },
        }),
        err.desc ? h("small.ss-error", err.desc) : null),
      h("div.ss-actions", h("button.ss-btn", { type: "submit" }, "Open email to SOC"))));
  }

  function supportPanel(ctx) {
    var feed = feedStatus(ctx);
    var signIn = !App.auth ? { text: "Not used (offline copy)", tone: "muted" }
      : ctx.state.userEmail ? { text: "Signed in", tone: "ok" } : { text: "Signed out", tone: "muted" };

    return [
      h("div.ss-auto-grid", CONTACTS.map(contactCard)),
      h("div.ss-support-grid",
        ticketCard(ctx),
        h("div.ss-stack",
          section("Service status", "Checked by this dashboard", [
            h("div.ss-list-row", h("span", "Branch data feed"), value(feed.text, feed.tone)),
            h("div.ss-list-row", h("span", "Sign-in service"), value(signIn.text, signIn.tone)),
          ]),
          section("Guides", "For operators and branch staff", DOCS.map(function (d) {
            return d.url
              ? h("a.ss-list-row.is-link", { href: d.url, target: "_blank", rel: "noopener" },
                h("span", d.title), h("span.ss-faint", d.kind))
              : h("div.ss-list-row", h("span.ss-faint", d.title), tag("Not published"));
          })))),
    ];
  }

  /* ---- About ------------------------------------------------------------ */

  function aboutPanel() {
    var stats = App.data.networkStats();
    var rows = [
      ["Application", "Intrusion Monitoring Dashboard"],
      ["Organisation", "Tamil Nadu Grama Bank · Head Office, Salem"],
      ["Branches monitored", stats.totalBranches + " across " + stats.totalDistricts + " districts"],
      ["Panels online now", stats.online + " of " + stats.totalBranches],
      ["Data source", App.data.load ? "Live branch data service" : "Built-in sample data"],
    ];
    return [
      section("About this system", null, rows.map(function (r) {
        return h("div.ss-list-row", h("span.ss-soft", r[0]), h("span.ss-strong", r[1]));
      })),
    ];
  }

  var PANELS = {
    general: generalPanel,
    appearance: appearancePanel,
    access: accessPanel,
    support: supportPanel,
    about: aboutPanel,
  };

  /* ---- Screen ----------------------------------------------------------- */

  function saveNote() {
    if (!ui.saved) return h("span.ss-save-note", "Display preferences are saved in this browser");
    if (!ui.saved.ok) return h("span.ss-save-note.is-warn", "Couldn't save — this change lasts until you close the tab");
    return h("span.ss-save-note.is-ok", "Saved · ", App.dom.val(App.prefs.fmtClock(ui.saved.at)));
  }

  function render(ctx) {
    var current = SECTIONS.find(function (s) { return s.key === ui.section; }) || SECTIONS[0];
    var accent = App.prefs.get("accent");

    var rail = h("nav.report-rail.ss-rail", { "aria-label": "Setting sections" }, SECTIONS.map(function (s) {
      var on = s.key === current.key;
      return h("button.report-item" + (on ? ".is-active" : ""), {
        type: "button", "aria-current": on ? "page" : null,
        onclick: function () { ui.section = s.key; ctx.setState({}); },
      },
      App.dom.iconChip(App.ICONS[s.icon], accent, { class: "sm" }),
      h("div", { style: "min-width:0;" },
        h("div.report-item-label", s.label),
        h("div.report-item-desc", s.desc)));
    }));

    var header = h("div.card.ss-header",
      h("div", h("div.report-title", current.label), h("div.report-desc", current.desc)),
      current.key === "appearance" || current.key === "general" ? saveNote() : null);

    return h("div.ss-layout", rail,
      h("div.ss-panel", header, PANELS[current.key](ctx)));
  }

  App.views = App.views || {};
  App.views.systemSetting = {
    label: "System Setting",
    icon: "settings",
    title: "System Setting",
    subtitle: "Display preferences, access and support",
    render: render,
  };
})(window.App = window.App || {});
