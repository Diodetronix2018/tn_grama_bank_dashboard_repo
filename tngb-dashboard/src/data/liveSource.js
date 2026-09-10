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

  App.data.load = load;
})(window.App = window.App || {});
