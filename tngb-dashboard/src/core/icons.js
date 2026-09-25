/* Inline SVG icon set. Every icon inherits currentColor so a single
   parent colour drives the whole glyph. */
(function (App) {
  "use strict";

  function svg(body, size) {
    return (
      '<svg width="' + (size || 15) + '" height="' + (size || 15) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + body + "</svg>"
    );
  }

  /* Wireframe globe shared by the online and offline (slashed) glyphs. */
  var GLOBE =
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/>' +
    '<path d="M12 3v18M3 12h18M4.2 7.5h15.6M4.2 16.5h15.6"/>';

  var ICONS = {
    overview: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>'),
    branches: svg('<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/>'),
    intrusion: svg('<path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z"/>'),
    /* Floor plan split into rooms, with a sensor broadcasting in one zone. */
    zones: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v4M9 10.5V21M9 14.5h4M16.5 14.5H21"/><circle cx="15" cy="8.3" r="1.2" fill="currentColor" stroke="none"/><path d="M12.7 6a3.2 3.2 0 000 4.6M17.3 6a3.2 3.2 0 010 4.6"/>'),
    power: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>'),
    activities: svg('<path d="M3 12h4l2 8 4-16 2 8h6"/>'),
    history: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>'),
    map: svg('<path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.4"/>'),
    alerts: svg('<path d="M12 2L1 21h22L12 2z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/>'),
    managers: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>'),
    reports: svg('<path d="M6 2h9l4 4v16H6z"/><path d="M9 12h6M9 16h6M9 8h3"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
    online: svg(GLOBE),
    offline: svg(GLOBE + '<path d="M21.5 2.5L2.5 21.5"/>'),
    fault: svg('<path d="M12 3.5L22 20H2z"/><path d="M12 9.5v5M12 17.5h.01"/>'),
    /* Car-style battery: two terminals, lid, body and an outlined bolt. */
    battery: svg('<path d="M5.5 6V4h3v2M15.5 6V4h3v2"/><rect x="2" y="6" width="20" height="2.8" rx=".4"/><path d="M3.3 8.8V20.5h17.4V8.8"/><path d="M10.8 10.6h2.8l-1.2 3.6h3l-4.2 5.4.9-3.8H9.2z"/>'),
    wifi: svg('<path d="M2 8.5a16 16 0 0120 0"/><path d="M5 12.5a11 11 0 0114 0"/><path d="M8.5 16a6 6 0 017 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>'),
    bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3a1.3 1.3 0 011.3 1.3v.6c2.6.7 4.5 3.1 4.5 6v3.2c0 .6.2 1.2.6 1.7l.7.9c.5.6.1 1.5-.7 1.5H5.6c-.8 0-1.2-.9-.7-1.5l.7-.9c.4-.5.6-1.1.6-1.7V10.9c0-2.9 1.9-5.3 4.5-6v-.6A1.3 1.3 0 0112 3z"/><path d="M9.5 20a2.5 2.5 0 005 0z"/></svg>',
    /* Away-arm: solid house with a door cut-out and a figure walking off. */
    arm: svg(
      '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M9 3.5l8.5 8h-2V21h-13v-9.5h-2L9 3.5zM7 13.5v6h4v-6H7z"/>' +
      '<rect x="3.3" y="4.5" width="2.2" height="5" fill="currentColor" stroke="none"/>' +
      '<circle cx="20.6" cy="13.6" r="1.25" fill="currentColor" stroke="none"/>' +
      '<path stroke-width="1.6" d="M20.2 15.9l-.8 3.3-1.6 2.6M19.4 19.2l1.8 1 .3 1.8M18.2 17.6l2-1.7 1.7 1.6"/>'
    ),
    /* Disarm: solid house with a person cut out, i.e. someone is home. */
    disarm: svg(
      '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 2.5l9.5 9h-2.3V21H4.8v-9.5H2.5L12 2.5zM13.6 10.6a1.6 1.6 0 1 1-3.2 0a1.6 1.6 0 1 1 3.2 0zM10.4 13.2h3.2a.8.8 0 01.8.8v3.6h-1.2V20h-2.4v-2.4H9.6V14a.8.8 0 01.8-.8z"/>' +
      '<rect x="5.8" y="4" width="2.2" height="5" fill="currentColor" stroke="none"/>'
    ),
    /* Tamper: a fist swinging a hammer at a surface, inside a ring. The hand
       and hammer are drawn upright, then turned 45° to strike down-right. */
    tamper: svg(
      '<circle cx="12" cy="12" r="10.5"/>' +
      '<path fill="currentColor" stroke="none" d="M7.85 19.19L19.8 9.16A8.3 8.3 0 0 1 7.85 19.19z"/>' +
      '<g fill="currentColor" stroke="none" transform="translate(10 10.3) rotate(45) scale(.9) translate(-12 -12)">' +
      '<rect x="11.2" y="5" width="1.6" height="7"/>' +
      '<rect x="12" y="3.4" width="4" height="3" rx=".5"/>' +
      '<path d="M12.4 3.4H10Q7.6 3.6 6.8 6.2Q8.6 5 12.4 6.4z"/>' +
      '<rect x="8.9" y="10.6" width="6.4" height="5" rx="1.7"/>' +
      '<rect x="9.6" y="16.4" width="5" height="3" rx=".4"/>' +
      "</g>"
    ),
    /* Open door on a threshold; every zone card in the Zone Status showcase. */
    zoneDoor: svg(
      '<path d="M3.5 19.5h17"/><path d="M8 19.5V5.5A1.5 1.5 0 019.5 4h3.7"/>' +
      '<path d="M13.2 4.2l4.5.9c.8.2 1.3.8 1.3 1.6v11.8c0 .6-.3 1-.9 1.2l-3.5 1.2c-.8.3-1.4-.2-1.4-1V4.2z"/>' +
      '<circle cx="15.4" cy="12" r=".9" fill="currentColor" stroke="none"/>',
      20
    ),
    lockClosed: svg('<path d="M8 10V7a4 4 0 018 0v3"/><rect x="5" y="10" width="14" height="10" rx="2.5"/><circle cx="12" cy="14.3" r="1.3" fill="currentColor" stroke="none"/><path d="M12 15.6v1.8"/>'),
    lockOpen: svg('<path d="M17 10V7a4 4 0 00-7.6-1.8M14.5 8.3L17 5.8"/><rect x="5" y="10" width="14" height="10" rx="2.5"/><circle cx="12" cy="14.3" r="1.3" fill="currentColor" stroke="none"/><path d="M12 15.6v1.8"/>'),
    download: svg('<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>'),
    shield: svg('<path d="M12 2L4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3z"/>'),
  };

  /* Zone-specific glyphs, one per physical zone of the 8-zone panel. */
  var ZONE_ICONS = [
    svg('<rect x="5" y="3" width="14" height="18" rx="1"/><circle cx="14" cy="12" r="1"/>', 20),
    svg('<path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z"/>', 20),
    svg('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>', 20),
    svg('<rect x="4" y="3" width="16" height="6" rx="1"/><rect x="4" y="15" width="16" height="6" rx="1"/><circle cx="8" cy="6" r=".8" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r=".8" fill="currentColor" stroke="none"/>', 20),
    svg('<rect x="5" y="3" width="14" height="18" rx="1"/><circle cx="10" cy="12" r="1"/>', 20),
    svg('<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>', 20),
    svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>', 20),
    svg('<rect x="4" y="7" width="16" height="13" rx="1"/><path d="M8 7V5a4 4 0 018 0v2"/>', 20),
  ];

  /* Which glyph represents each event type in feeds and logs. */
  var EVENT_ICONS = {
    Arm: ICONS.arm,
    Disarm: ICONS.disarm,
    Alarm: ICONS.bell,
    Fault: ICONS.fault,
    "AC Fail": ICONS.power,
    "AC Restore": ICONS.power,
    "Battery Fail": ICONS.battery,
    "Battery Restore": ICONS.battery,
    "Tamper Activate": ICONS.tamper,
    "Tamper Restore": ICONS.tamper,
    "Communication Lost": ICONS.offline,
    "Communication Restored": ICONS.online,
  };

  App.ICONS = ICONS;
  App.ZONE_ICONS = ZONE_ICONS;
  App.EVENT_ICONS = EVENT_ICONS;
})(window.App = window.App || {});
