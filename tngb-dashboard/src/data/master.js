/* Master data: districts, branch roster and the deterministic status mix.

   The whole network is generated from fixed seeds, so every count on the
   dashboard is backed by a real, drillable list of branches rather than a
   hard-coded number. Replace this module with your core-banking feed and
   the rest of the app keeps working unchanged. */
(function (App) {
  "use strict";

  var u = App.utils;

  var DISTRICTS = [
    "Ariyalur", "Chengalpattu", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul",
    "Erode", "Kallakurichi", "Kancheepuram", "Kanyakumari", "Karur", "Krishnagiri",
    "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur",
    "Pudukottai", "Ramanathapuram", "Ranipettai", "Salem", "Sivagangai", "Tenkasi",
    "Thanjavur", "Theni", "Thiruvallur", "Thiruvarur", "Thoothukudi", "Tiruchirappalli",
    "Tirunelveli", "Tirupathur", "Tirupattur", "Tiruppur", "Tiruvannamalai", "Vellore",
    "Villupuram", "Virudhunagar",
  ];

  /* Approximate district centroids, used by the Location Maps view. */
  var DISTRICT_COORDS = {
    Ariyalur: [11.14, 79.08], Chengalpattu: [12.69, 79.98], Coimbatore: [11.02, 76.96],
    Cuddalore: [11.75, 79.77], Dharmapuri: [12.13, 78.16], Dindigul: [10.36, 77.98],
    Erode: [11.34, 77.72], Kallakurichi: [11.74, 78.96], Kancheepuram: [12.84, 79.70],
    Kanyakumari: [8.18, 77.43], Karur: [10.96, 78.08], Krishnagiri: [12.52, 78.21],
    Madurai: [9.93, 78.12], Mayiladuthurai: [11.10, 79.65], Nagapattinam: [10.77, 79.84],
    Namakkal: [11.22, 78.17], Nilgiris: [11.41, 76.70], Perambalur: [11.23, 78.88],
    Pudukottai: [10.38, 78.82], Ramanathapuram: [9.37, 78.83], Ranipettai: [12.93, 79.33],
    Salem: [11.66, 78.15], Sivagangai: [9.85, 78.48], Tenkasi: [8.96, 77.31],
    Thanjavur: [10.79, 79.14], Theni: [10.01, 77.48], Thiruvallur: [13.14, 79.91],
    Thiruvarur: [10.77, 79.64], Thoothukudi: [8.76, 78.13], Tiruchirappalli: [10.79, 78.70],
    Tirunelveli: [8.71, 77.76], Tirupathur: [9.85, 78.60], Tirupattur: [12.50, 78.57],
    Tiruppur: [11.10, 77.34], Tiruvannamalai: [12.23, 79.07], Vellore: [12.92, 79.13],
    Villupuram: [11.94, 79.49], Virudhunagar: [9.57, 77.96],
  };

  var TARGET_TOTAL_BRANCHES = 680;
  var HOME_DISTRICT = "Madurai";
  var HOME_DISTRICT_BRANCHES = 21;

  /* --- Branch counts per district, scaled to hit the network total exactly --- */
  var countRnd = u.mulberry32(20260907);
  var rawCounts = DISTRICTS.map(function (name) {
    return name === HOME_DISTRICT ? null : 10 + Math.floor(countRnd() * 20);
  });
  var rawSum = rawCounts.reduce(function (s, v) { return s + (v || 0); }, 0);
  var counts = rawCounts.map(function (v) {
    if (v === null) return HOME_DISTRICT_BRANCHES;
    return Math.max(5, Math.round((v / rawSum) * (TARGET_TOTAL_BRANCHES - HOME_DISTRICT_BRANCHES)));
  });
  var countSum = counts.reduce(function (s, v) { return s + v; }, 0);
  counts[DISTRICTS.findIndex(function (n) { return n !== HOME_DISTRICT; })] +=
    TARGET_TOTAL_BRANCHES - countSum;

  var REGIONS = DISTRICTS.map(function (name, i) {
    return { name: name, branchCount: counts[i], coords: DISTRICT_COORDS[name] };
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });

  /* --- Status mix ---------------------------------------------------------
     A shuffled pool that sums to exactly 680 branches:
       350 Armed + 150 Disarmed                        -> 500 Online
       50 Alarm Active + 20 Fault + 110 plain Offline  -> 180 Offline        */
  var CATEGORY_MIX = [
    [350, "Armed", "Online"],
    [150, "Disarmed", "Online"],
    [50, "Alarm Active", "Offline"],
    [20, "Fault", "Offline"],
    [110, "Offline", "Offline"],
  ];
  var CATEGORY_POOL = [];
  CATEGORY_MIX.forEach(function (row) {
    for (var i = 0; i < row[0]; i++) {
      CATEGORY_POOL.push({ panelStatus: row[1], connectivity: row[2] });
    }
  });
  (function shuffle() {
    var r = u.mulberry32(99887766);
    for (var i = CATEGORY_POOL.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var tmp = CATEGORY_POOL[i];
      CATEGORY_POOL[i] = CATEGORY_POOL[j];
      CATEGORY_POOL[j] = tmp;
    }
  })();

  var BRANCH_SUFFIXES = [
    "Main Branch", "Town Branch", "Bazaar Branch", "RS Puram", "Extension Counter",
    "New Bus Stand", "Market Branch", "College Road", "Old Town", "West Extension",
  ];
  var FIRST_NAMES = ["K.", "S.", "R.", "M.", "P.", "V.", "N.", "A.", "T.", "G."];
  var LAST_NAMES = [
    "Bhuvaneswari", "Elango", "Saravanan", "Meenakshi", "Gopinath",
    "Kumar", "Devi", "Rajan", "Priya", "Suresh",
  ];
  var SAMPLE_ZONES = [
    "Main Entrance", "Strong Room", "Cash Counter", "Back Door", "ATM Room",
  ];

  var ZONE_LABELS = [
    "Main Entrance", "Strong Room / Vault", "Cash Counter", "Server Room",
    "Back Door", "ATM Room", "Manager Cabin", "Locker Room",
  ];

  /* Every generated timestamp falls inside this window. TODAY is the day the
     dashboard reports as "now" for today-scoped counters. */
  var MONTH = "2026-09-";
  var TODAY = "2026-09-08";

  function dayStamp(r, hourBase, hourSpread, minuteTens) {
    var day = 1 + Math.floor(r() * 7);
    var hour = hourBase + Math.floor(r() * hourSpread);
    var minute = minuteTens * 10 + Math.floor(r() * 10);
    return MONTH + u.pad2(day) + " " + u.pad2(hour) + ":" + u.pad2(minute);
  }

  function todayStamp(r, hourBase, hourSpread) {
    return (
      TODAY + " " + u.pad2(hourBase + Math.floor(r() * hourSpread)) +
      ":" + u.pad2(Math.floor(r() * 6) * 10)
    );
  }

  function branchName(district, i) {
    var suffix = BRANCH_SUFFIXES[i % BRANCH_SUFFIXES.length];
    var repeat = i >= BRANCH_SUFFIXES.length
      ? " " + (Math.floor(i / BRANCH_SUFFIXES.length) + 1)
      : "";
    return district + " " + suffix + repeat;
  }

  function buildEvents(r, panelStatus, connectivity) {
    var needsAttention = panelStatus === "Alarm Active" || panelStatus === "Fault";
    var events = [];
    if (connectivity === "Offline") {
      events.push({ type: "Communication Lost", time: dayStamp(r, 10, 9, 2) });
      if (needsAttention) {
        events.push({
          type: panelStatus === "Alarm Active" ? "Alarm" : "Fault",
          zone: "Zone " + (1 + Math.floor(r() * 8)) + " - " + u.pick(r, SAMPLE_ZONES),
          time: dayStamp(r, 20, 3, 4),
        });
      }
    } else {
      events.push({
        type: panelStatus === "Disarmed" ? "Disarm" : "Arm",
        time: dayStamp(r, 6, 3, 1),
      });
    }
    return events;
  }

  function buildBranch(district, i, category) {
    var r = u.seededRnd(district + "#" + i);
    var panelStatus = category.panelStatus;
    var connectivity = category.connectivity;
    var needsAttention = panelStatus === "Alarm Active" || panelStatus === "Fault";
    var managerName = u.pick(r, FIRST_NAMES) + " " + u.pick(r, LAST_NAMES);
    var events = buildEvents(r, panelStatus, connectivity);
    var emailUser = managerName.replace(/[^a-zA-Z]/g, "").toLowerCase() || "manager";

    return {
      id: district + "-" + i,
      name: branchName(district, i),
      branchIdCode: "TNGB-" + (2000 + Math.floor(r() * 7999)),
      district: district,
      panelStatus: panelStatus,
      connectivity: connectivity,
      status: needsAttention || connectivity === "Offline" ? "Attention" : "Normal",
      manager: {
        name: managerName,
        id: "BM-" + (1000 + Math.floor(r() * 8999)),
        contact: "+91 9" + String(400000000 + Math.floor(r() * 99999999)).slice(0, 9),
        email: emailUser + "." + district.toLowerCase().replace(/\s+/g, "") + "@tngb.co.in",
      },
      events: events,
    };
  }

  /* The head-office reference branch. It carries hand-entered master data
     instead of generated data, and is pinned Armed / Online below. */
  var FLAGSHIP = {
    id: "madurai-melur",
    name: "Melur Branch",
    branchIdCode: "TNGB-2041",
    district: HOME_DISTRICT,
    isReference: true,
    manager: {
      name: "K. Bhuvaneswari",
      id: "BM-4417",
      contact: "+91 94421 08877",
      email: "bhuvaneswari.melur@tngb.co.in",
    },
    events: [
      { type: "Arm", time: "2026-09-08 06:42" },
      { type: "Alarm", zone: "Zone 2 - Strong Room", time: "2026-09-07 22:16" },
      { type: "Fault", zone: "Zone 6 - ATM Room", time: "2026-09-07 19:04" },
      { type: "Disarm", time: "2026-09-07 18:30" },
    ],
  };

  var _cache = null;
  var _externalCache = null;

  /* Called by src/data/liveSource.js once the backend responds. Every other
     function in this module and in src/data/derived.js reads branches
     through allBranches(), so pointing that one function at fetched data is
     enough to make the whole dashboard live -- nothing else changes. */
  function setBranches(list) {
    _externalCache = list;
    _cache = null;
    _stats = null;
    if (App.data.invalidateDerived) App.data.invalidateDerived();
  }

  function allBranches() {
    if (_externalCache) return _externalCache;
    if (_cache) return _cache;

    var list = [];
    var offset = 0;
    REGIONS.forEach(function (region) {
      for (var i = 0; i < region.branchCount; i++) {
        var category = CATEGORY_POOL[(offset + i) % CATEGORY_POOL.length];
        list.push(buildBranch(region.name, i, category));
      }
      offset += region.branchCount;
    });

    /* Pin the reference branch to Armed / Online. Whatever category its slot
       drew is handed to a branch that already held Armed / Online, so network
       totals stay exactly 350 / 150 / 50 / 20 / 110. */
    var slot = list.findIndex(function (b) { return b.district === HOME_DISTRICT; });
    var displaced = {
      panelStatus: list[slot].panelStatus,
      connectivity: list[slot].connectivity,
    };
    if (displaced.panelStatus !== "Armed" || displaced.connectivity !== "Online") {
      var donor = list.find(function (b, idx) {
        return idx !== slot && b.panelStatus === "Armed" && b.connectivity === "Online";
      });
      donor.panelStatus = displaced.panelStatus;
      donor.connectivity = displaced.connectivity;
      donor.status =
        donor.panelStatus === "Alarm Active" || donor.panelStatus === "Fault" ||
        donor.connectivity === "Offline" ? "Attention" : "Normal";
      donor.events = buildEvents(
        u.seededRnd(donor.id + "-recategorised"),
        donor.panelStatus,
        donor.connectivity
      );
    }

    list[slot] = Object.assign({}, FLAGSHIP, {
      panelStatus: "Armed",
      connectivity: "Online",
      status: "Normal",
    });

    _cache = list;
    return _cache;
  }

  function branchById(id) {
    return allBranches().find(function (b) { return b.id === id; }) || null;
  }

  function branchesIn(district) {
    return allBranches().filter(function (b) { return b.district === district; });
  }

  /* Roll-up counters for one district. */
  function districtStats(district) {
    var s = { total: 0, online: 0, offline: 0, armed: 0, disarmed: 0, alarm: 0, fault: 0 };
    branchesIn(district).forEach(function (b) {
      s.total++;
      if (b.connectivity === "Online") s.online++; else s.offline++;
      if (b.panelStatus === "Armed") s.armed++;
      else if (b.panelStatus === "Disarmed") s.disarmed++;
      else if (b.panelStatus === "Alarm Active") s.alarm++;
      else if (b.panelStatus === "Fault") s.fault++;
    });
    return s;
  }

  /* One rule for a district's headline status, used by the region list, the
     district table and the map, so the three can never disagree. */
  function districtStatus(stats) {
    if (stats.alarm > 0) return "Alarm";
    if (stats.fault > 0) return "Fault";
    if (stats.offline > 0) return "Attention";
    return "Normal";
  }

  var STATUS_COLORS = {
    Alarm: u.COLORS.red,
    Fault: u.COLORS.amber,
    Attention: u.COLORS.slate,
    Normal: u.COLORS.green,
  };

  var _stats = null;

  function networkStats() {
    if (_stats) return _stats;
    var s = { online: 0, offline: 0, armed: 0, disarmed: 0, alarm: 0, fault: 0, abnormal: 0 };
    var all = allBranches();
    all.forEach(function (b) {
      if (b.connectivity === "Online") s.online++; else s.offline++;
      if (b.panelStatus === "Armed") s.armed++;
      else if (b.panelStatus === "Disarmed") s.disarmed++;
      else if (b.panelStatus === "Alarm Active") s.alarm++;
      else if (b.panelStatus === "Fault") s.fault++;
      /* One count per branch: an alarm or fault panel is usually offline
         too, so summing offline + alarm + fault would count it twice. */
      if (b.connectivity === "Offline" || b.panelStatus === "Alarm Active" ||
          b.panelStatus === "Fault") s.abnormal++;
    });
    s.totalBranches = all.length;
    s.totalDistricts = REGIONS.length;
    s.normal = s.totalBranches - s.abnormal;
    _stats = s;
    return s;
  }

  App.data = App.data || {};
  Object.assign(App.data, {
    DISTRICTS: DISTRICTS,
    REGIONS: REGIONS,
    ZONE_LABELS: ZONE_LABELS,
    SAMPLE_ZONES: SAMPLE_ZONES,
    FIRST_NAMES: FIRST_NAMES,
    LAST_NAMES: LAST_NAMES,
    HOME_DISTRICT: HOME_DISTRICT,
    TODAY: TODAY,
    MONTH: MONTH,
    todayStamp: todayStamp,
    dayStamp: dayStamp,
    allBranches: allBranches,
    setBranches: setBranches,
    branchById: branchById,
    branchesIn: branchesIn,
    districtStats: districtStats,
    districtStatus: districtStatus,
    STATUS_COLORS: STATUS_COLORS,
    networkStats: networkStats,
  });
})(window.App = window.App || {});
