/* Minimal DOM builder. `h` is the only thing views need to render markup. */
(function (App) {
  "use strict";

  function applyProps(el, props) {
    Object.keys(props).forEach(function (key) {
      var val = props[key];
      if (val === null || val === undefined || val === false) return;

      if (key === "class" || key === "className") {
        el.className = val;
      } else if (key === "style") {
        if (typeof val === "string") el.setAttribute("style", val);
        else Object.assign(el.style, val);
      } else if (key === "html") {
        el.innerHTML = val;
      } else if (key === "text") {
        el.textContent = val;
      } else if (key === "dataset") {
        Object.assign(el.dataset, val);
      } else if (key.slice(0, 2) === "on" && typeof val === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === "value") {
        el.value = val;
      } else if (key === "checked" || key === "disabled") {
        el[key] = !!val;
      } else {
        el.setAttribute(key, val);
      }
    });
  }

  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { append(el, c); });
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }

  /* h("div.card", {onclick: fn}, child, child, ...)
     The tag accepts an optional `.class.list` suffix for brevity. */
  function h(tag, props) {
    var parts = tag.split(".");
    var el = document.createElement(parts[0] || "div");
    if (parts.length > 1) el.className = parts.slice(1).join(" ");

    var childStart = 2;
    if (props && (props instanceof Node || Array.isArray(props) || typeof props !== "object")) {
      childStart = 1;
    } else if (props) {
      var cls = props.class || props.className;
      applyProps(el, props);
      if (cls && parts.length > 1) el.className = parts.slice(1).join(" ") + " " + cls;
    }

    for (var i = childStart; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  var BADGE_CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var BADGE_ALERT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
    'stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 7v6"/>' +
    '<circle cx="12" cy="16.8" r="1.4" fill="currentColor" stroke="none"/></svg>';

  /* Tone of each palette colour. Problem tones are filled solid on light
     cards; on dark surfaces (onDark tones) every badge stays tinted, since
     white text on a light tone would not read. Grey and slate share an onDark
     tone, so both map to "neutral". */
  var badgeTones = null;
  function badgeTone(color) {
    if (!badgeTones) {
      var C = App.utils.COLORS;
      badgeTones = {};
      [
        [C.red, "red", true], [C.amber, "amber", true], [C.olive, "olive", true],
        [C.green, "green", false], [C.navy, "navy", false],
        [C.grey, "neutral", false], [C.slate, "neutral", false],
      ].forEach(function (t) {
        badgeTones[t[0]] = { name: t[1], solid: t[2] };
        badgeTones[App.utils.onDark(t[0])] = { name: t[1], solid: false };
      });
    }
    return badgeTones[color] || null;
  }

  /* The specific glyphs (bell, globe, locks, wrench, hammer) follow the label, so a
     warning that isn't a fault -- "85% Normal" -- or a grey
     "Bypassed" doesn't borrow them; anything else gets its tone's glyph. */
  function badgeIcon(tone, text) {
    var I = App.ICONS;
    if (/^(Armed|Arm)$/.test(text)) return I.lockClosed;
    if (/^(Disarmed|Disarm)$/.test(text)) return I.lockOpen;
    if (/^Alarm/.test(text) && tone === "red") return I.bell;
    if (text === "Offline") return I.offline;
    if (/Fault/.test(text) && tone !== "green") return I.fault;
    if (/Tamper/.test(text) && tone === "olive") return I.tamper;
    return {
      red: BADGE_ALERT, amber: I.alerts, olive: I.alerts,
      green: BADGE_CHECK, navy: I.info, neutral: I.info,
    }[tone];
  }

  /* A status badge tinted by a single colour. Its look (signal / tag / dot)
     is set in CSS from the operator's badgeStyle preference; "no-dot" marks a
     count or plain label that carries no status icon. */
  function badge(text, color, extraClass) {
    var tone = extraClass === "no-dot" ? null : badgeTone(color);
    var icon = tone ? badgeIcon(tone.name, String(text)) : null;
    return h("span.badge" + (extraClass ? "." + extraClass : "") + (tone && tone.solid ? ".is-solid" : ""), {
      style: App.utils.badgeStyle(color),
    }, icon ? h("span.badge-ic", { html: icon, "aria-hidden": "true" }) : null, text);
  }

  /* A square icon chip: solid fill or tinted, both driven by one colour. */
  function iconChip(iconHtml, color, opts) {
    opts = opts || {};
    var style = opts.solid
      ? "background:" + color + ";color:#fff;border-color:" + color + ";"
      : "background:" + color + "14;color:" + color + ";border-color:" + color + "33;";
    if (opts.size) style += "width:" + opts.size + "px;height:" + opts.size + "px;flex:0 0 " + opts.size + "px;";
    if (opts.radius) style += "border-radius:" + opts.radius + "px;";
    return h("span.icon-chip" + (opts.class ? "." + opts.class : ""), { style: style, html: iconHtml });
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  /* An important value inside running text, e.g. the "12" in "12 offline".
     Bold via the .val rule in styles.css. */
  function val(value) {
    return h("span.val", String(value));
  }

  App.dom = { h: h, badge: badge, iconChip: iconChip, clear: clear, val: val };
})(window.App = window.App || {});
