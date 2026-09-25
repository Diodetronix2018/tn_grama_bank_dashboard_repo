/* Inline SVG icon set. Every icon inherits currentColor so a single
   parent colour drives the whole glyph. */
(function (App) {
  "use strict";

  function svg(body, size) {
    return (
      '<svg width="' + (size || 18) + '" height="' + (size || 18) +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + body + "</svg>"
    );
  }

  /* Globe shared by the online and offline (slashed) glyphs: rim, one
     meridian lens and the equator, kept sparse so it reads at 18px. */
  var GLOBE =
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/>' +
    '<path d="M12 3a13.5 13.5 0 010 18a13.5 13.5 0 010-18z"/>';

  /* Tamper: a hammer inside a ring, head up-right, handle down-left. */
  var TAMPER =
    '<circle cx="12" cy="12" r="10"/>' +
    '<g transform="rotate(40 12 12)">' +
    '<rect x="7.5" y="4.8" width="9" height="4.6" rx="1" fill="currentColor" stroke="none"/>' +
    '<path stroke-width="2.8" d="M12 9.4v9.6"/>' +
    "</g>";

  var ICONS = {
    overview: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>'),
    branches: svg('<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/>'),
    /* Shield with an alert mark, so it differs from the plain brand shield. */
    intrusion: svg('<path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z"/><path d="M12 7.5v5"/><circle cx="12" cy="16" r="1.1" fill="currentColor" stroke="none"/>'),
    /* Floor plan split into three rooms, with a sensor dot in one zone. */
    zones: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M11 3v6.5M11 14v7M11 12.5h10"/><circle cx="16" cy="7.8" r="1.9" fill="currentColor" stroke="none"/>'),
    power: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>'),
    activities: svg('<path d="M3 12h4l2 8 4-16 2 8h6"/>'),
    history: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>'),
    map: svg('<path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.4"/>'),
    alerts: svg('<path d="M12 2L1 21h22L12 2z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/>'),
    managers: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>'),
    reports: svg('<path d="M6 2h9l4 4v16H6z"/><path d="M9 12h6M9 16h6M9 8h3"/>'),
    /* Eight-tooth gear with a hub. */
    settings: svg('<path d="M19.06 10.57L21.52 10.76L21.52 13.24L19.06 13.43L18 15.98L19.61 17.85L17.85 19.61L15.98 18L13.43 19.06L13.24 21.52L10.76 21.52L10.57 19.06L8.02 18L6.15 19.61L4.39 17.85L6 15.98L4.94 13.43L2.48 13.24L2.48 10.76L4.94 10.57L6 8.02L4.39 6.15L6.15 4.39L8.02 6L10.57 4.94L10.76 2.48L13.24 2.48L13.43 4.94L15.98 6L17.85 4.39L19.61 6.15L18 8.02z"/><circle cx="12" cy="12" r="3"/>'),
    online: svg(GLOBE),
    /* Rim and meridian only (no equator) so the slash stays readable. */
    offline: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a13.5 13.5 0 010 18a13.5 13.5 0 010-18z"/><path d="M21 3L3 21"/>'),
    /* Wrench: a trouble condition, distinct from the alerts triangle. */
    fault: svg('<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>'),
    /* Car-style battery: two solid terminals on a body marked + and -. */
    battery: svg('<rect x="5" y="3.8" width="3.6" height="3.2" rx=".6" fill="currentColor" stroke="none"/><rect x="15.4" y="3.8" width="3.6" height="3.2" rx=".6" fill="currentColor" stroke="none"/><rect x="2.5" y="7" width="19" height="13" rx="2"/><path d="M5.8 13.5h4.4M8 11.3v4.4M13.8 13.5h4.4"/>'),
    wifi: svg('<path d="M2 8.5a16 16 0 0120 0"/><path d="M5 12.5a11 11 0 0114 0"/><path d="M8.5 16a6 6 0 017 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>'),
    bell: '<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3a1.3 1.3 0 011.3 1.3v.6c2.6.7 4.5 3.1 4.5 6v3.2c0 .6.2 1.2.6 1.7l.7.9c.5.6.1 1.5-.7 1.5H5.6c-.8 0-1.2-.9-.7-1.5l.7-.9c.4-.5.6-1.1.6-1.7V10.9c0-2.9 1.9-5.3 4.5-6v-.6A1.3 1.3 0 0112 3z"/><path d="M9.5 20a2.5 2.5 0 005 0z"/></svg>',
    /* Away-arm: solid house with a door cut-out and a figure walking off. */
    arm: svg(
      '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M9 3.5l8.5 8h-2V21h-13v-9.5h-2L9 3.5zM7 13.5v6h4v-6H7z"/>' +
      '<rect x="3.3" y="4.5" width="2.2" height="5" fill="currentColor" stroke="none"/>' +
      '<circle cx="20.6" cy="13.6" r="1.25" fill="currentColor" stroke="none"/>' +
      '<path stroke-width="1.9" d="M20.2 15.9l-.8 3.3-1.6 2.6M19.4 19.2l1.8 1 .3 1.8M18.2 17.6l2-1.7 1.7 1.6"/>'
    ),
    /* Disarm: solid house with a person cut out, i.e. someone is home. */
    disarm: svg(
      '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M12 2.5l9.5 9h-2.3V21H4.8v-9.5H2.5L12 2.5zM13.6 10.6a1.6 1.6 0 1 1-3.2 0a1.6 1.6 0 1 1 3.2 0zM10.4 13.2h3.2a.8.8 0 01.8.8v3.6h-1.2V20h-2.4v-2.4H9.6V14a.8.8 0 01.8-.8z"/>' +
      '<rect x="5.8" y="4" width="2.2" height="5" fill="currentColor" stroke="none"/>'
    ),
    tamper: svg(TAMPER),
    /* 24px copy for the Tamper card beside the 8 zone cards. */
    tamperLg: svg(TAMPER, 24),
    /* Open door on a threshold; every zone card in the Zone Status showcase. */
    zoneDoor: svg(
      '<path d="M3.5 19.5h17"/><path d="M8 19.5V5.5A1.5 1.5 0 019.5 4h3.7"/>' +
      '<path d="M13.2 4.2l4.5.9c.8.2 1.3.8 1.3 1.6v11.8c0 .6-.3 1-.9 1.2l-3.5 1.2c-.8.3-1.4-.2-1.4-1V4.2z"/>' +
      '<circle cx="15.4" cy="12" r=".9" fill="currentColor" stroke="none"/>',
      24
    ),
    lockClosed: svg('<path d="M8 10V7a4 4 0 018 0v3"/><rect x="5" y="10" width="14" height="10" rx="2.5"/><circle cx="12" cy="14.3" r="1.3" fill="currentColor" stroke="none"/><path d="M12 15.6v1.8"/>'),
    lockOpen: svg('<path d="M8 10V7a4 4 0 017.7-1.5"/><rect x="5" y="10" width="14" height="10" rx="2.5"/><circle cx="12" cy="14.3" r="1.3" fill="currentColor" stroke="none"/><path d="M12 15.6v1.8"/>'),
    download: svg('<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>'),
    shield: svg('<path d="M12 2L4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3z"/>'),
  };

  /* Zone-specific glyphs, one per physical zone of the 8-zone panel. */
  var ZONE_ICONS = [
    svg('<rect x="5" y="3" width="14" height="18" rx="1"/><circle cx="14" cy="12" r="1"/>', 24),
    svg('<path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z"/>', 24),
    svg('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>', 24),
    svg('<rect x="4" y="3" width="16" height="6" rx="1"/><rect x="4" y="15" width="16" height="6" rx="1"/><circle cx="8" cy="6" r=".8" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r=".8" fill="currentColor" stroke="none"/>', 24),
    svg('<rect x="5" y="3" width="14" height="18" rx="1"/><circle cx="10" cy="12" r="1"/>', 24),
    svg('<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>', 24),
    svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>', 24),
    svg('<rect x="4" y="7" width="16" height="13" rx="1"/><path d="M8 7V5a4 4 0 018 0v2"/>', 24),
  ];

  /* Which glyph represents each event type in feeds and logs. */
  var EVENT_ICONS = {
    Arm: ICONS.arm,
    Disarm: ICONS.disarm,
    Alarm: ICONS.bell,
    Fault: ICONS.fault,
    "AC Fail": ICONS.power,
    "AC Normal": ICONS.power,
    "Battery Fail": ICONS.battery,
    "Battery Normal": ICONS.battery,
    "Tamper Activate": ICONS.tamper,
    "Tamper Normal": ICONS.tamper,
    "Communication Lost": ICONS.offline,
    "Communication Restored": ICONS.online,
  };

  App.ICONS = ICONS;
  App.ZONE_ICONS = ZONE_ICONS;
  App.EVENT_ICONS = EVENT_ICONS;
})(window.App = window.App || {});
