/* Derived data: per-branch zones, power health, and the event stream.

   Everything here is a pure function of the master roster plus a fixed seed,
   so any number shown on a card can be drilled into and reconciled against a
   list of real branch records. */
(function (App) {
  "use strict";

  var u = App.utils;
  var data = App.data;
  var COLORS = u.COLORS;

  var EVENT_TYPES = [
    "Arm", "Disarm", "Alarm", "Fault",
    "AC Fail", "AC Restore", "Battery Fail", "Battery Restore",
    "Tamper Activate", "Tamper Restore",
    "Communication Lost", "Communication Restored",
  ];

  var EVENT_COLORS = {
    Arm: COLORS.green,
    Disarm: COLORS.slate,
    Alarm: COLORS.red,
    Fault: COLORS.amber,
    "AC Fail": COLORS.red,
    "AC Restore": COLORS.green,
    "Battery Fail": COLORS.red,
    "Battery Restore": COLORS.green,
    "Tamper Activate": COLORS.orange,
    "Tamper Restore": COLORS.green,
    "Communication Lost": COLORS.slate,
    "Communication Restored": COLORS.green,
  };

  /* --- Zones ------------------------------------------------------------- */

  var _zoneCache = {};

  /* Expands a branch into its 8 physical zones. Alarm and fault land on a
     specific zone so the branch-level status always has a zone that explains
     it; tamper is independent and rare. */
  function zonesFor(branch) {
    if (_zoneCache[branch.id]) return _zoneCache[branch.id];

    var zr = u.seededRnd(branch.id + "-zones8");
    var events = branch.events || [];
    var offline = branch.connectivity === "Offline";
    var disarmed = branch.panelStatus === "Disarmed";
    var alarmZone = branch.panelStatus === "Alarm Active" ? Math.floor(zr() * 8) : -1;
    var faultZone = branch.panelStatus === "Fault" ? Math.floor(zr() * 8) : -1;

    var armEvt = events.find(function (e) { return e.type === "Arm" || e.type === "Disarm"; });
    var alarmEvt = events.find(function (e) { return e.type === "Alarm"; });
    var faultEvt = events.find(function (e) { return e.type === "Fault"; });

    var rows = data.ZONE_LABELS.map(function (label, i) {
      var isAlarm = i === alarmZone;
      var isFault = i === faultZone;
      var isTamper = !offline && !disarmed && alarmZone < 0 && faultZone < 0 && zr() < 0.012;

      var status = offline ? "Unknown" : disarmed ? "Bypassed" : "Active";
      var lastTrigger = "--";
      if (isAlarm && alarmEvt) lastTrigger = alarmEvt.time;
      else if (isFault && faultEvt) lastTrigger = faultEvt.time;
      else if (isTamper) lastTrigger = data.dayStamp(zr, 10, 9, 3);
      else if (armEvt) lastTrigger = armEvt.time;

      var dominantLabel = isTamper ? "Tamper" : isAlarm ? "Alarm" : isFault ? "Fault" : "Normal";
      var dominant = isTamper ? COLORS.orange
        : isAlarm ? COLORS.red
        : isFault ? COLORS.amber
        : COLORS.green;

      return {
        id: branch.id + "-z" + (i + 1),
        num: i + 1,
        name: "Zone " + (i + 1) + " - " + label,
        iconHtml: App.ZONE_ICONS[i],
        status: status,
        statusColor: status === "Active" ? COLORS.green
          : status === "Bypassed" ? COLORS.grey : COLORS.slate,
        condition: isAlarm ? "Alarm" : "Normal",
        conditionColor: isAlarm ? COLORS.red : COLORS.green,
        fault: isFault ? "Fault" : "OK",
        faultColor: isFault ? COLORS.amber : COLORS.green,
        tamper: isTamper ? "Tamper" : "OK",
        tamperColor: isTamper ? COLORS.orange : COLORS.green,
        lastTrigger: lastTrigger,
        dominant: dominant,
        dominantLabel: dominantLabel,
      };
    });

    _zoneCache[branch.id] = rows;
    return rows;
  }

  /* --- Power ------------------------------------------------------------- */

  var _powerCache = {};

  /* AC mains and battery health. Offline panels are overwhelmingly likely to
     be offline *because* mains failed, which is why the odds differ so much. */
  function powerFor(branch) {
    if (_powerCache[branch.id]) return _powerCache[branch.id];

    var pr = u.seededRnd(branch.id + "-power");
    var offline = branch.connectivity === "Offline";
    var acFail = offline ? pr() < 0.8 : pr() < 0.02;
    var acRestoredToday = !acFail && pr() < 0.06;
    var acRestoredAt = acRestoredToday ? data.todayStamp(pr, 6, 3) : null;

    var batteryStatus = acFail
      ? (pr() < 0.35 ? "Fail" : "Normal")
      : (pr() < 0.03 ? "Fail" : "Normal");
    var batteryRestoredToday = batteryStatus === "Normal" && pr() < 0.05;
    var batteryRestoredAt = batteryRestoredToday ? data.todayStamp(pr, 7, 3) : null;

    var voltage = batteryStatus === "Fail"
      ? +(9.5 + pr() * 1.2).toFixed(1)
      : +(12.4 + pr() * 1.4).toFixed(1);

    var charging = batteryStatus === "Fail" ? "Fault"
      : acFail ? "Discharging"
      : voltage >= 13.2 ? "Fully Charged"
      : "Charging";

    var power = {
      acStatus: acFail ? "Fail" : "Normal",
      acRestoredToday: acRestoredToday,
      acRestoredAt: acRestoredAt,
      batteryStatus: batteryStatus,
      batteryRestoredToday: batteryRestoredToday,
      batteryRestoredAt: batteryRestoredAt,
      voltage: voltage,
      chargingStatus: charging,
      acColor: acFail ? COLORS.red : COLORS.green,
      batteryColor: batteryStatus === "Fail" ? COLORS.red : COLORS.green,
      chargingColor: charging === "Fully Charged" ? COLORS.green
        : charging === "Charging" ? COLORS.navy
        : charging === "Discharging" ? COLORS.amber
        : COLORS.red,
    };

    _powerCache[branch.id] = power;
    return power;
  }

  var _powerRows = null;
  function powerRows() {
    if (_powerRows) return _powerRows;
    _powerRows = data.allBranches().map(function (b) {
      return { branch: b, power: powerFor(b) };
    });
    return _powerRows;
  }

  /* --- Event stream ------------------------------------------------------ */

  /* One branch's contribution to the network event log: panel activity,
     power transitions and tamper trips, all carrying the same shape. */
  function eventsFor(branch) {
    var out = [];
    var power = powerFor(branch);
    var cr = u.seededRnd(branch.id + "-comm");

    (branch.events || []).forEach(function (e) {
      out.push({ type: e.type, time: e.time, zone: e.zone || "" });
    });

    if (branch.connectivity === "Online" && cr() < 0.05) {
      out.push({ type: "Communication Restored", time: data.todayStamp(cr, 7, 3) });
    }
    if (power.acStatus === "Fail") {
      out.push({ type: "AC Fail", time: data.dayStamp(cr, 10, 9, 1) });
    }
    if (power.acRestoredToday) {
      out.push({ type: "AC Restore", time: power.acRestoredAt });
    }
    if (power.batteryStatus === "Fail") {
      out.push({ type: "Battery Fail", time: data.dayStamp(cr, 10, 9, 3) });
    }
    if (power.batteryRestoredToday) {
      out.push({ type: "Battery Restore", time: power.batteryRestoredAt });
    }

    zonesFor(branch).forEach(function (z) {
      if (z.tamper !== "Tamper") return;
      out.push({ type: "Tamper Activate", time: z.lastTrigger, zone: z.name });
      if (cr() < 0.5) out.push({ type: "Tamper Restore", time: z.lastTrigger, zone: z.name });
    });

    return out;
  }

  var _allEvents = null;

  /* The whole network event log, newest first. */
  function allEvents() {
    if (_allEvents) return _allEvents;
    var out = [];
    data.allBranches().forEach(function (b) {
      eventsFor(b).forEach(function (e) {
        out.push({
          type: e.type,
          time: e.time,
          zone: e.zone || "",
          branch: b.name,
          district: b.district,
          branchId: b.id,
        });
      });
    });
    out.sort(function (a, b) { return a.time < b.time ? 1 : a.time > b.time ? -1 : 0; });
    _allEvents = out;
    return out;
  }

  var _eventCounts = null;
  function eventCounts() {
    if (_eventCounts) return _eventCounts;
    var counts = {};
    EVENT_TYPES.forEach(function (t) { counts[t] = 0; });
    allEvents().forEach(function (e) {
      if (counts[e.type] !== undefined) counts[e.type]++;
    });
    _eventCounts = counts;
    return counts;
  }

  /* --- Currently-open tamper conditions ---------------------------------- */

  var _tamperBranches = null;

  /* Branches with at least one zone still in tamper, plus the zone and the
     time it tripped, so the Intrusion view can list them rather than show a
     bare count. */
  function tamperBranches() {
    if (_tamperBranches) return _tamperBranches;
    _tamperBranches = [];
    data.allBranches().forEach(function (b) {
      var zone = zonesFor(b).find(function (z) { return z.tamper === "Tamper"; });
      if (zone) {
        _tamperBranches.push({ branch: b, zone: zone.name, time: zone.lastTrigger });
      }
    });
    return _tamperBranches;
  }

  /* --- Cleared-earlier-today incidents ----------------------------------- */

  var _restored = null;

  /* Incidents that fired earlier today and have since cleared. Each one keeps
     its branch, zone and clear time, so "Alarm Restored: 34" opens a table of
     34 real records. */
  function restoredEvents() {
    if (_restored) return _restored;
    _restored = { alarm: [], fault: [], tamper: [] };
    data.allBranches().forEach(function (b) {
      var rr = u.seededRnd(b.id + "-restored");
      var add = function (bucket, chance, hourBase) {
        if (rr() >= chance) return;
        _restored[bucket].push({
          branch: b,
          zone: u.pick(rr, data.SAMPLE_ZONES),
          time: data.todayStamp(rr, hourBase, 3),
        });
      };
      add("alarm", 0.05, 6);
      add("fault", 0.06, 7);
      add("tamper", 0.015, 5);
    });
    return _restored;
  }

  /* --- Report definitions ------------------------------------------------ */

  var REPORT_DEFS = [
    { key: "daily", label: "Daily Report", desc: "All events logged on the latest day", scope: "events", range: "today", color: COLORS.navy, icon: "history" },
    { key: "weekly", label: "Weekly Report", desc: "All events over the last 7 days", scope: "events", range: "week", color: COLORS.navy, icon: "history" },
    { key: "monthly", label: "Monthly Report", desc: "All events this month", scope: "events", range: "month", color: COLORS.navy, icon: "history" },
    { key: "branchwise", label: "Branch-wise Report", desc: "Per-branch panel and event summary", scope: "branchwise", color: COLORS.navy, icon: "branches" },
    { key: "alarm", label: "Alarm Report", desc: "Alarm activations network-wide", scope: "events", types: ["Alarm"], color: COLORS.red, icon: "alerts" },
    { key: "fault", label: "Fault Report", desc: "Fault conditions network-wide", scope: "events", types: ["Fault"], color: COLORS.amber, icon: "fault" },
    { key: "armdisarm", label: "Arm / Disarm Report", desc: "Panel arm and disarm activity", scope: "events", types: ["Arm", "Disarm"], color: COLORS.green, icon: "intrusion" },
    { key: "acfail", label: "AC Fail Report", desc: "AC mains failures and restores", scope: "events", types: ["AC Fail", "AC Restore"], color: COLORS.red, icon: "power" },
    { key: "battery", label: "Battery Report", desc: "Battery failures and restores", scope: "events", types: ["Battery Fail", "Battery Restore"], color: COLORS.red, icon: "battery" },
    { key: "tamper", label: "Tamper Report", desc: "Tamper activations and restores", scope: "events", types: ["Tamper Activate", "Tamper Restore"], color: COLORS.orange, icon: "zones" },
  ];

  Object.assign(App.data, {
    EVENT_TYPES: EVENT_TYPES,
    EVENT_COLORS: EVENT_COLORS,
    REPORT_DEFS: REPORT_DEFS,
    zonesFor: zonesFor,
    powerFor: powerFor,
    powerRows: powerRows,
    eventsFor: eventsFor,
    allEvents: allEvents,
    eventCounts: eventCounts,
    tamperBranches: tamperBranches,
    restoredEvents: restoredEvents,
  });
})(window.App = window.App || {});
