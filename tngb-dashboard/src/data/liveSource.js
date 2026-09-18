/* Fetches branch records from the backend API instead of generating sample
   data. Loading this file is what switches the dashboard from "local demo"
   to "backend-fed" -- leave it out of the page and everything behaves
   exactly as it did before (src/data/master.js generates its own sample
   set, same as tests/selftest.html still does).

   CONFIG below is a local-development convenience, not how a real
   deployment should hold its key -- see backend/.env.example and
   IMPLEMENTATION.md for the production note on this. */
(function (App) {
  "use strict";

  var CONFIG = {
    apiBaseUrl: "http://127.0.0.1:8787",
    apiKey: "dev-local-key-change-me",
  };

  /* The upstream telemetry table gets a new record roughly every 5 minutes;
     poll on the same cadence so the dashboard picks it up without a reload. */
  var POLL_INTERVAL_MS = 5 * 60 * 1000;
  var pollTimer = null;
  var inFlight = false;

  function applyRegionCounts(branches) {
    var counts = {};
    branches.forEach(function (b) {
      counts[b.district] = (counts[b.district] || 0) + 1;
    });
    (App.data.REGIONS || []).forEach(function (r) {
      r.branchCount = counts[r.name] || 0;
    });
  }

  function load() {
    return fetch(CONFIG.apiBaseUrl + "/api/branches", {
      headers: { "X-API-Key": CONFIG.apiKey },
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("Branch data service returned HTTP " + res.status);
        }
        return res.json();
      })
      .then(function (payload) {
        var branches = payload.branches || [];
        if (!branches.length) {
          throw new Error("Branch data service returned zero branches");
        }
        App.data.setBranches(branches);
        applyRegionCounts(branches);
        return branches;
      });
  }

  /* One tick of the background refresh. Skips this tick rather than queuing
     if the previous fetch hasn't settled yet -- avoids overlapping requests
     if the backend is briefly slow. A failed poll rejects inside load()
     before setBranches() runs, so it never disturbs the data already on
     screen; it only reports itself via App.reportRefresh so app.js can show
     a low-key indicator instead of the full-page boot-error screen. */
  function poll() {
    if (inFlight) return;
    inFlight = true;
    load().then(
      function () {
        inFlight = false;
        if (App.reportRefresh) App.reportRefresh(true);
      },
      function (err) {
        inFlight = false;
        if (App.reportRefresh) App.reportRefresh(false, err && err.message);
      }
    );
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  }

  App.data.load = load;
  App.data.startPolling = startPolling;
})(window.App = window.App || {});
