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

  var ICONS = {
    overview: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>'),
    branches: svg('<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/>'),
    intrusion: svg('<path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z"/>'),
    zones: svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
    power: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>'),
    activities: svg('<path d="M3 12h4l2 8 4-16 2 8h6"/>'),
    history: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>'),
    map: svg('<path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.4"/>'),
    alerts: svg('<path d="M12 2L1 21h22L12 2z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/>'),
    managers: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>'),
    reports: svg('<path d="M6 2h9l4 4v16H6z"/><path d="M9 12h6M9 16h6M9 8h3"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
    online: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="7.8" fill="currentColor" stroke="none"/>'),
    offline: svg('<circle cx="12" cy="12" r="9" opacity=".45"/><circle cx="12" cy="12" r="7.8" fill="currentColor" stroke="none" opacity=".45"/>'),
    fault: svg('<path d="M12 3.5L22 20H2z"/><path d="M12 9.5v5M12 17.5h.01"/>'),
    battery: svg('<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 10v4"/><path d="M6 12h3l1.5-2 2 4L14 12h3"/>'),
    wifi: svg('<path d="M2 8.5a16 16 0 0120 0"/><path d="M5 12.5a11 11 0 0114 0"/><path d="M8.5 16a6 6 0 017 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>'),
    bell: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3a1.3 1.3 0 011.3 1.3v.6c2.6.7 4.5 3.1 4.5 6v3.2c0 .6.2 1.2.6 1.7l.7.9c.5.6.1 1.5-.7 1.5H5.6c-.8 0-1.2-.9-.7-1.5l.7-.9c.4-.5.6-1.1.6-1.7V10.9c0-2.9 1.9-5.3 4.5-6v-.6A1.3 1.3 0 0112 3z"/><path d="M9.5 20a2.5 2.5 0 005 0z"/></svg>',
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
    Arm: ICONS.lockClosed,
    Disarm: ICONS.lockOpen,
    Alarm: ICONS.bell,
    Fault: ICONS.fault,
    "AC Fail": ICONS.power,
    "AC Restore": ICONS.power,
    "Battery Fail": ICONS.battery,
    "Battery Restore": ICONS.battery,
    "Tamper Activate": ICONS.zones,
    "Tamper Restore": ICONS.zones,
    "Communication Lost": ICONS.wifi,
    "Communication Restored": ICONS.wifi,
  };

  App.ICONS = ICONS;
  App.ZONE_ICONS = ZONE_ICONS;
  App.EVENT_ICONS = EVENT_ICONS;
})(window.App = window.App || {});
