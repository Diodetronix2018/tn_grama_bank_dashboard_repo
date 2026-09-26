/* Application shell: state, navigation, and the render loop.

   State is a single plain object. `setState` merges a patch and repaints the
   content region; nothing else in the app touches the DOM outside its own
   render function. */
(function (App) {
  "use strict";

  var h = App.dom.h;
  var u = App.utils;
  var COLORS = u.COLORS;

  /* Sidebar order. Each key must have a matching module in src/views. */
  var NAV_ORDER = [
    "overview", "branchMonitoring", "intrusionStatus", "zoneStatus", "powerStatus",
    "liveActivities", "eventHistory", "locationMaps", "managerDetails", "reports",
    "systemSetting",
  ];

  var state = {
    active: "overview",
    now: new Date(),
    lastUpdated: null,
    refreshError: null,
    userEmail: null,

    /* Overview */
    regionSearch: "",
    selectedRegion: App.data.HOME_DISTRICT,
    selectedBranchId: null,
    kpiFilter: null,

    /* Branch monitoring */
    bmSearch: "",

    /* Intrusion */
    liveStatusFilter: null,

    /* Zones */
    zoneSearch: "",
    zoneSelectedBranchId: null,
    zoneViewMode: "showcase",
    zonePickerMode: "district",
    zonePickerDistrict: null,

    /* Power */
    powerFilter: null,
    powerSearch: "",

    /* Live activities */
    liveActivityFilter: null,
    liveViewMode: App.prefs.get("liveView"),

    /* Event history */
    ehSearch: "",
    ehTypeFilter: null,

    /* Managers */
    mgrSearch: "",

    /* Reports */
    reportType: "daily",

    /* System Setting keeps its own preferences in localStorage
       (src/views/systemSetting.js), so it adds nothing here. */
  };

  var refs = {};

  function setState(patch) {
    Object.assign(state, patch);
    render();
  }

  /* Called by src/data/liveSource.js after every background poll -- success
     bumps the freshness timestamp and clears any earlier error; failure
     leaves the last-good data on screen and just flags it as delayed. */
  function reportRefresh(ok, message) {
    /* A poll already in flight when the operator signed out still settles;
       there is no dashboard left to update. */
    if (!dashboardShown) return;
    if (ok) {
      state.lastUpdated = new Date();
      state.refreshError = null;
    } else {
      state.refreshError = message || "Background refresh failed";
    }
    render();
  }

  function go(key) {
    if (!App.views[key]) return;
    state.active = key;
    if (window.location.hash.slice(1) !== key) {
      window.history.replaceState(null, "", "#" + key);
    }
    render();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  var ctx = {
    get state() { return state; },
    setState: setState,
    go: go,
  };

  /* ---- Chrome ---------------------------------------------------------- */

  function buildSidebar() {
    var nav = h("nav.sidebar",
      h(
        "div.brand",
        h("span.brand-mark", h("img", { src: "assets/logo.png", alt: "TN Grama Bank logo" })),
        h("div", { style: "min-width:0;" },
          h("div.brand-name", "TN GRAMA BANK"),
          h("div.brand-sub", "HEAD OFFICE, SALEM"),
          h("div.brand-sub.brand-sub-accent", "SECURITY OPS"))
      ),
      h("div.nav-heading", "DASHBOARD")
    );

    refs.navButtons = {};
    NAV_ORDER.forEach(function (key) {
      var view = App.views[key];
      if (!view) return;
      var button = h(
        "button.nav-item",
        { type: "button", title: view.label, onclick: function () { go(key); } },
        h("span.nav-chip", { html: App.ICONS[view.icon] }),
        h("span.nav-label", view.label),
        h("span.nav-dot", { style: "visibility:hidden;" })
      );
      refs.navButtons[key] = button;
      nav.appendChild(button);
    });

    nav.appendChild(h("div.sidebar-note",
      "Structure follows the bank's security-ops mind map, cross-checked against " +
      "the Tamil Nadu district list. Sample data — point src/data at the real feed."));

    return nav;
  }

  function overallPill(stats) {
    if (stats.alarm > 0) {
      return { label: "ALERT — ALARM ACTIVE", icon: App.ICONS.bell, bg: "#fdeeee", color: COLORS.red, border: "#f3c9c9" };
    }
    if (stats.fault > 0) {
      return { label: "WARNING — FAULT PRESENT", icon: App.ICONS.fault, bg: "#fdf3e4", color: COLORS.amber, border: "#f0dcb3" };
    }
    if (stats.offline > 0) {
      return { label: "WARNING — PANELS OFFLINE", icon: App.ICONS.offline, bg: "#fdeeee", color: COLORS.red, border: "#f3c9c9" };
    }
    return { label: "SECURE — ALL NORMAL", icon: App.ICONS.shield, bg: "#e9f6ee", color: COLORS.green, border: "#bfe3cc" };
  }

  function buildTopbar() {
    refs.title = h("h1");
    refs.subtitle = h("div.topbar-sub");
    refs.clock = h("span.clock-time", App.prefs.fmtClock(state.now));
    refs.pill = h("div.overall-pill");
    refs.freshness = h("span.freshness");
    refs.idleNote = h("span.idle-note", { role: "status" });
    refs.userChip = h("span", state.userEmail || "");

    /* Named apart from signOut() -- a local `signOut` here would shadow the
       function and leave the button's onclick undefined. */
    refs.userBox = h(
      "div.user-chip",
      refs.userChip,
      h("button.sign-out-btn", { type: "button", onclick: signOut }, "Sign out")
    );

    return h(
      "header.topbar",
      h("div", refs.title, refs.subtitle),
      h("div.topbar-right",
        refs.idleNote,
        refs.freshness,
        h("div.clock", h("span.clock-dot"), refs.clock),
        refs.pill,
        refs.userBox)
    );
  }

  /* ---- Render ---------------------------------------------------------- */

  /* Repainting the content region blows away focus, so remember which input
     the operator was typing in and restore it plus the caret afterwards. */
  function captureFocus() {
    var el = document.activeElement;
    if (!el || !el.id || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return null;
    return {
      id: el.id,
      start: el.selectionStart,
      end: el.selectionEnd,
    };
  }

  function restoreFocus(snapshot) {
    if (!snapshot) return;
    var el = document.getElementById(snapshot.id);
    if (!el) return;
    el.focus();
    if (el.setSelectionRange && snapshot.start !== null && el.type !== "range") {
      try { el.setSelectionRange(snapshot.start, snapshot.end); } catch (err) { /* type has no selection */ }
    }
  }

  function render() {
    var view = App.views[state.active] || App.views.overview;
    var stats = App.data.networkStats();
    var pill = overallPill(stats);
    var focus = captureFocus();

    refs.title.textContent = view.title;
    refs.subtitle.textContent = view.subtitle;
    refs.clock.textContent = App.prefs.fmtClock(state.now);
    App.dom.clear(refs.pill);
    refs.pill.appendChild(h("span.overall-pill-ic", { html: pill.icon, "aria-hidden": "true" }));
    refs.pill.appendChild(document.createTextNode(pill.label));
    refs.pill.setAttribute(
      "style",
      "background:" + pill.bg + ";color:" + pill.color + ";border-color:" + pill.border + ";"
    );

    refs.freshness.classList.toggle("is-stale", !!state.refreshError);
    App.dom.clear(refs.freshness);
    if (state.lastUpdated) {
      refs.freshness.appendChild(document.createTextNode(state.refreshError
        ? "Live feed delayed — showing data from " : "Updated "));
      refs.freshness.appendChild(App.dom.val(App.prefs.fmtClock(state.lastUpdated)));
    }

    /* Sample-data copies (preview, file://, selftest) have no session, so
       there is nothing to sign out of. */
    refs.userChip.textContent = state.userEmail || "";
    refs.userBox.classList.toggle("hidden", !(App.auth && state.userEmail));

    Object.keys(refs.navButtons).forEach(function (key) {
      var isActive = key === state.active;
      refs.navButtons[key].classList.toggle("is-active", isActive);
      refs.navButtons[key].lastChild.style.visibility = isActive ? "visible" : "hidden";
    });

    App.dom.clear(refs.content);
    refs.content.appendChild(view.render(ctx));
    restoreFocus(focus);
  }

  /* ---- Boot ------------------------------------------------------------ */

  var chromeInitialized = false;

  /* True while the dashboard shell is on screen; the boot and sign-in
     screens clear it. */
  var dashboardShown = false;

  function boot() {
    var root = document.getElementById("app");
    App.dom.clear(root);
    dashboardShown = true;
    refs.content = h("main.content");

    var main = h("div.main", buildTopbar(), refs.content);
    root.appendChild(h("div.shell", buildSidebar(), main));

    var hash = window.location.hash.slice(1);
    if (App.views[hash]) state.active = hash;

    /* One-time setup only -- boot() can now run more than once per page
       load (e.g. after a session expires and the operator signs back in),
       and re-registering these each time would stack up duplicate timers
       and listeners. */
    if (!chromeInitialized) {
      chromeInitialized = true;

      window.addEventListener("hashchange", function () {
        var key = window.location.hash.slice(1);
        if (App.views[key] && key !== state.active) {
          state.active = key;
          render();
        }
      });

      /* The header clock is the only thing that ticks; repainting the whole
         content region every second would fight with scrolling and typing. */
      setInterval(function () {
        state.now = new Date();
        refs.clock.textContent = App.prefs.fmtClock(state.now);
        checkIdle();
      }, 1000);

      ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"].forEach(function (type) {
        document.addEventListener(type, noteActivity, { passive: true, capture: true });
      });
    }

    noteActivity();

    render();

    /* No-op wherever src/data/liveSource.js isn't loaded (e.g. selftest.html,
       which deliberately runs on generated sample data only). */
    if (App.data.startPolling) App.data.startPolling();
  }

  function renderBootState(title, detail, isError, onRetry) {
    var root = document.getElementById("app");
    App.dom.clear(root);
    dashboardShown = false;
    var card = h(
      "div.boot-card",
      isError ? null : h("div.boot-spinner"),
      h("div.boot-title" + (isError ? ".is-error" : ""), title),
      h("div.boot-detail", detail)
    );
    if (isError) {
      card.appendChild(
        h("button.boot-retry", { type: "button", onclick: onRetry }, "Retry")
      );
    }
    root.appendChild(h("div.boot-state", card));
  }

  /* Fetches branch data and boots the dashboard shell, or shows a blocking
     retry screen on failure -- shared by the initial page load and by a
     fresh login after a session expired. A 401 mid-fetch (session expired
     between checking /me and this actually running) falls back to the
     login screen rather than the generic retry screen. */
  function loadThenBoot() {
    renderBootState(
      "Loading branch data",
      "Fetching the live feed from the branch data service…",
      false
    );

    App.data.load().then(function () {
      state.lastUpdated = new Date();
      boot();
    }, function (err) {
      if (err && err.isAuthError) {
        renderLoginScreen("Your session expired — sign in again.");
        return;
      }
      renderBootState(
        "Could not reach the branch data service",
        (err && err.message ? err.message : "Request failed") +
          ". Confirm the backend is running (see backend/README.md), then retry.",
        true,
        loadThenBoot
      );
    });
  }

  /* ---- Auth ------------------------------------------------------------- */

  function renderLoginScreen(message) {
    if (App.data.stopPolling) App.data.stopPolling();

    var root = document.getElementById("app");
    App.dom.clear(root);
    dashboardShown = false;

    var usernameInput = h("input.text-input", {
      type: "text", id: "login-username", placeholder: "Email", autocomplete: "username",
    });
    var passwordInput = h("input.text-input", {
      type: "password", id: "login-password", placeholder: "Password", autocomplete: "current-password",
    });
    var errorBox = h("div.login-error", message || "");

    function submit() {
      var username = usernameInput.value.trim();
      var password = passwordInput.value;
      if (!username || !password) {
        errorBox.textContent = "Enter your email and password.";
        return;
      }
      errorBox.textContent = "Signing in…";
      App.auth.login(username, password).then(function (res) {
        if (res.status === "new_password_required") {
          renderNewPasswordScreen(username, res.session);
          return;
        }
        if (res.status === "mfa_required") {
          renderMfaScreen(username, res.mfa_type, res.session);
          return;
        }
        state.userEmail = res.email;
        loadThenBoot();
      }, function (err) {
        renderLoginScreen((err && err.message) || "Sign-in failed.");
      });
    }

    var onEnter = function (e) { if (e.key === "Enter") submit(); };
    usernameInput.onkeydown = onEnter;
    passwordInput.onkeydown = onEnter;

    var card = h(
      "div.boot-card.login-card",
      h("div.boot-title", "TN Grama Bank — Sign in"),
      h("div.login-field", h("label", { for: "login-username" }, "Email"), usernameInput),
      h("div.login-field", h("label", { for: "login-password" }, "Password"), passwordInput),
      errorBox,
      h("button.boot-retry", { type: "button", onclick: submit }, "Sign in"),
      h("button.forgot-password-link", { type: "button", onclick: function () { renderForgotPasswordScreen(); } }, "Forgot password?")
    );
    root.appendChild(h("div.boot-state", card));
    usernameInput.focus();
  }

  /* Admin-created accounts get a temporary password and must set a real one
     on first login -- Cognito's NEW_PASSWORD_REQUIRED challenge, surfaced by
     /api/auth/login as {status:"new_password_required", session}. */
  function renderNewPasswordScreen(username, cognitoSession, message) {
    var root = document.getElementById("app");
    App.dom.clear(root);

    var newPasswordInput = h("input.text-input", {
      type: "password", id: "new-password", placeholder: "New password", autocomplete: "new-password",
    });
    var confirmInput = h("input.text-input", {
      type: "password", id: "confirm-password", placeholder: "Confirm new password", autocomplete: "new-password",
    });
    var errorBox = h("div.login-error", message || "");

    function submit() {
      var newPassword = newPasswordInput.value;
      if (!newPassword || newPassword !== confirmInput.value) {
        errorBox.textContent = "Passwords must match and cannot be empty.";
        return;
      }
      errorBox.textContent = "Setting your password…";
      App.auth.completeNewPassword(username, newPassword, cognitoSession).then(function (res) {
        state.userEmail = res.email;
        loadThenBoot();
      }, function (err) {
        renderNewPasswordScreen(username, cognitoSession, (err && err.message) || "Could not set your password.");
      });
    }

    var onEnter = function (e) { if (e.key === "Enter") submit(); };
    newPasswordInput.onkeydown = onEnter;
    confirmInput.onkeydown = onEnter;

    var card = h(
      "div.boot-card.login-card",
      h("div.boot-title", "Set a new password"),
      h("div.boot-detail", "First sign-in for " + username + " — choose a password only you know."),
      h("div.login-field", h("label", { for: "new-password" }, "New password"), newPasswordInput),
      h("div.login-field", h("label", { for: "confirm-password" }, "Confirm new password"), confirmInput),
      errorBox,
      h("button.boot-retry", { type: "button", onclick: submit }, "Set password and sign in")
    );
    root.appendChild(h("div.boot-state", card));
    newPasswordInput.focus();
  }

  /* Cognito's SMS_MFA / SOFTWARE_TOKEN_MFA challenge -- only appears for
     accounts that have MFA enrolled (the pool is MfaConfiguration=OPTIONAL,
     not required), so a non-MFA account's login is completely unaffected. */
  function renderMfaScreen(username, mfaType, cognitoSession, message) {
    var root = document.getElementById("app");
    App.dom.clear(root);

    var codeInput = h("input.text-input", {
      type: "text", id: "mfa-code", placeholder: "6-digit code", autocomplete: "one-time-code",
    });
    var errorBox = h("div.login-error", message || "");

    function submit() {
      var code = codeInput.value.trim();
      if (!code) {
        errorBox.textContent = "Enter the code from your authenticator.";
        return;
      }
      errorBox.textContent = "Verifying…";
      App.auth.completeMfa(username, mfaType, code, cognitoSession).then(function (res) {
        state.userEmail = res.email;
        loadThenBoot();
      }, function (err) {
        renderMfaScreen(username, mfaType, cognitoSession, (err && err.message) || "Invalid code.");
      });
    }

    codeInput.onkeydown = function (e) { if (e.key === "Enter") submit(); };

    var card = h(
      "div.boot-card.login-card",
      h("div.boot-title", "Verification code"),
      h("div.boot-detail", "Enter the verification code for " + username + "."),
      h("div.login-field", h("label", { for: "mfa-code" }, "Code"), codeInput),
      errorBox,
      h("button.boot-retry", { type: "button", onclick: submit }, "Verify")
    );
    root.appendChild(h("div.boot-state", card));
    codeInput.focus();
  }

  /* Cognito's self-service reset: step 1 (this screen) emails a code and
     always shows the same message whether or not the account exists (the
     backend guarantees that -- this screen never learns which). Step 2 is
     renderResetPasswordScreen. */
  function renderForgotPasswordScreen() {
    var root = document.getElementById("app");
    App.dom.clear(root);

    var usernameInput = h("input.text-input", {
      type: "text", id: "forgot-username", placeholder: "Email", autocomplete: "username",
    });
    var errorBox = h("div.login-error", "");

    function submit() {
      var username = usernameInput.value.trim();
      if (!username) {
        errorBox.textContent = "Enter your email.";
        return;
      }
      errorBox.textContent = "Sending…";
      var fallbackDetail = "If that account exists, a reset code has been sent to its email.";
      App.auth.forgotPassword(username).then(function (res) {
        renderResetPasswordScreen(username, res.detail || fallbackDetail);
      }, function () {
        renderResetPasswordScreen(username, fallbackDetail);
      });
    }

    usernameInput.onkeydown = function (e) { if (e.key === "Enter") submit(); };

    var card = h(
      "div.boot-card.login-card",
      h("div.boot-title", "Reset your password"),
      h("div.login-field", h("label", { for: "forgot-username" }, "Email"), usernameInput),
      errorBox,
      h("button.boot-retry", { type: "button", onclick: submit }, "Send reset code"),
      h("button.forgot-password-link", { type: "button", onclick: function () { renderLoginScreen(); } }, "Back to sign in")
    );
    root.appendChild(h("div.boot-state", card));
    usernameInput.focus();
  }

  function renderResetPasswordScreen(username, detail, error) {
    var root = document.getElementById("app");
    App.dom.clear(root);

    var codeInput = h("input.text-input", {
      type: "text", id: "reset-code", placeholder: "Reset code", autocomplete: "one-time-code",
    });
    var newPasswordInput = h("input.text-input", {
      type: "password", id: "reset-new-password", placeholder: "New password", autocomplete: "new-password",
    });
    var confirmInput = h("input.text-input", {
      type: "password", id: "reset-confirm-password", placeholder: "Confirm new password", autocomplete: "new-password",
    });
    var errorBox = h("div.login-error", error || "");

    function submit() {
      var code = codeInput.value.trim();
      var newPassword = newPasswordInput.value;
      if (!code || !newPassword || newPassword !== confirmInput.value) {
        errorBox.textContent = "Enter the code and matching new passwords.";
        return;
      }
      errorBox.textContent = "Resetting…";
      App.auth.confirmForgotPassword(username, code, newPassword).then(function () {
        renderLoginScreen("Password reset — sign in with your new password.");
      }, function (err) {
        renderResetPasswordScreen(username, detail, (err && err.message) || "Could not reset your password.");
      });
    }

    var onEnter = function (e) { if (e.key === "Enter") submit(); };
    codeInput.onkeydown = onEnter;
    newPasswordInput.onkeydown = onEnter;
    confirmInput.onkeydown = onEnter;

    var card = h(
      "div.boot-card.login-card",
      h("div.boot-title", "Enter reset code"),
      h("div.boot-detail", detail || ""),
      h("div.login-field", h("label", { for: "reset-code" }, "Reset code"), codeInput),
      h("div.login-field", h("label", { for: "reset-new-password" }, "New password"), newPasswordInput),
      h("div.login-field", h("label", { for: "reset-confirm-password" }, "Confirm new password"), confirmInput),
      errorBox,
      h("button.boot-retry", { type: "button", onclick: submit }, "Reset password")
    );
    root.appendChild(h("div.boot-state", card));
    codeInput.focus();
  }

  function signOut() {
    App.auth.logout().then(afterSignOut, afterSignOut);
  }

  function afterSignOut(message) {
    state.userEmail = null;
    state.lastUpdated = null;
    state.refreshError = null;
    renderLoginScreen(typeof message === "string" ? message : "");
  }

  /* ---- Inactivity sign-out --------------------------------------------- */

  /* Signs the operator out after the idle time chosen under System Setting >
     General, warning in the header for the last minute. Only runs while
     signed in -- the offline copy (no App.auth) has no session to end. The
     server's own session lifetime still applies on top of this. */
  var IDLE_WARNING_MS = 60 * 1000;
  var lastActivity = Date.now();

  function noteActivity() {
    lastActivity = Date.now();
  }

  function checkIdle() {
    if (!App.auth || !state.userEmail) {
      refs.idleNote.textContent = "";
      return;
    }
    var limit = App.prefs.get("idleTimeoutMin") * 60 * 1000;
    var remaining = limit - (Date.now() - lastActivity);
    if (remaining <= 0) {
      refs.idleNote.textContent = "";
      var minutes = App.prefs.get("idleTimeoutMin");
      var message = "Signed out after " + minutes + " minutes without activity — sign in again.";
      state.userEmail = null; // stops further checks while logout is in flight
      if (App.data.stopPolling) App.data.stopPolling();
      App.auth.logout().then(function () { afterSignOut(message); }, function () { afterSignOut(message); });
      return;
    }
    refs.idleNote.textContent = remaining <= IDLE_WARNING_MS
      ? "Signing out in " + Math.ceil(remaining / 1000) + "s — move the mouse or press a key to stay"
      : "";
  }

  /* Called by src/data/liveSource.js when a background poll gets a 401 --
     the session timed out mid-use. Distinct from a network hiccup
     (reportRefresh's low-key "feed delayed" indicator): this needs the
     operator to sign in again, not just a retry. */
  function onSessionExpired() {
    if (!dashboardShown) return;
    state.userEmail = null;
    renderLoginScreen("Your session expired — sign in again.");
  }

  /* If src/data/liveSource.js is loaded (see index.html), a session check
     runs before anything renders: a valid session loads branch data and
     boots straight in (silent resume); no session shows the login screen.
     Without liveSource.js/authSource.js (as in tests/selftest.html) the
     dashboard boots straight into the generated sample data, exactly as
     before -- unauthenticated dashboard views are never part of that path. */
  function start() {
    /* Opened straight from disk (index.html or the emailed standalone build)
       liveSource.js and authSource.js don't register, so this runs on the
       bundled sample data. */
    if (!App.data.load || !App.auth) {
      boot();
      return;
    }

    App.auth.me().then(function (res) {
      state.userEmail = res.email;
      loadThenBoot();
    }, function () {
      renderLoginScreen();
    });
  }

  App.start = start;
  App.reportRefresh = reportRefresh;
  App.onSessionExpired = onSessionExpired;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window.App = window.App || {});
