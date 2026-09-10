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

  /* A pill badge tinted by a single colour. */
  function badge(text, color, extraClass) {
    return h("span.badge" + (extraClass ? "." + extraClass : ""), {
      style: App.utils.badgeStyle(color),
    }, text);
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

  App.dom = { h: h, badge: badge, iconChip: iconChip, clear: clear };
})(window.App = window.App || {});
