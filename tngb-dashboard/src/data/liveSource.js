/* Fetches branch records from the backend API instead of generating sample
   data. Loading this file is what switches the dashboard from "local demo"
   to "backend-fed" -- leave it out of the page and everything behaves
   exactly as it did before (src/data/master.js generates its own sample
   set, same as tests/selftest.html still does).

   apiBaseUrl below is a local-development convenience, not how a real
   deployment should hold it -- see backend/.env.example and
   IMPLEMENTATION.md for the production note on this.

   Auth is now a signed session cookie (see src/data/authSource.js), not an
   API key -- every fetch here sends credentials:"include" so the browser
   attaches it. apiBaseUrl is deliberately "localhost", not "127.0.0.1":
   the session cookie is Secure+SameSite=Strict, and browsers treat
   localhost/127.0.0.1 as different *sites* even though they're the same
   machine -- SameSite=Strict would silently withhold the cookie across
   that mismatch. Serve this dashboard via `python -m http.server 8000`
   (http://localhost:8000), not as a file:// page, for the same reason. */
(function (App) {
  "use strict";

  /* Port 8000 is this repo's documented local-dev static-file-server port
     (see README): frontend and backend run as two separate processes there,
     so the API needs an absolute URL. Anywhere else (a single combined
     deployment serving both from one origin -- see backend/app/main.py's
     serve_dashboard_static), a relative path targets whatever origin this
     page was actually loaded from. */
  var CONFIG = {
    apiBaseUrl: window.location.port === "8000" ? "http://localhost:8787" : "",
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
      credentials: "include",
    })
      .then(function (res) {
        if (res.status === 401) {
          var authErr = new Error("Session expired");
          authErr.isAuthError = true;
          throw authErr;
        }
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
     screen. A session-expiry failure is reported distinctly (via
     App.onSessionExpired) from any other failure (App.reportRefresh's
     low-key "feed delayed" indicator) -- a timed-out session needs the
     operator to sign in again, not just a retry. */
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
        if (err && err.isAuthError && App.onSessionExpired) {
          App.onSessionExpired();
          return;
        }
        if (App.reportRefresh) App.reportRefresh(false, err && err.message);
      }
    );
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  App.data.apiBaseUrl = CONFIG.apiBaseUrl;
  App.data.load = load;
  App.data.startPolling = startPolling;
  App.data.stopPolling = stopPolling;
})(window.App = window.App || {});
