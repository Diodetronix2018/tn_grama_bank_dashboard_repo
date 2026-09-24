/* Talks to the backend's /api/auth/* endpoints. Kept separate from
   liveSource.js the same way master.js/derived.js/liveSource.js are each
   scoped to one concern. Every call sends credentials:"include" so the
   browser attaches/receives the session cookie. */
(function (App) {
  "use strict";

  function apiBaseUrl() {
    return (App.data && App.data.apiBaseUrl) || "http://localhost:8787";
  }

  function postJson(path, body) {
    return fetch(apiBaseUrl() + path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.detail) || "Request failed");
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function login(username, password) {
    return postJson("/api/auth/login", { username: username, password: password });
  }

  function completeNewPassword(username, newPassword, cognitoSession) {
    return postJson("/api/auth/complete-new-password", {
      username: username,
      new_password: newPassword,
      session: cognitoSession,
    });
  }

  function completeMfa(username, mfaType, code, cognitoSession) {
    return postJson("/api/auth/complete-mfa", {
      username: username,
      mfa_type: mfaType,
      code: code,
      session: cognitoSession,
    });
  }

  function forgotPassword(username) {
    return postJson("/api/auth/forgot-password", { username: username });
  }

  function confirmForgotPassword(username, confirmationCode, newPassword) {
    return postJson("/api/auth/confirm-forgot-password", {
      username: username,
      confirmation_code: confirmationCode,
      new_password: newPassword,
    });
  }

  function logout() {
    return postJson("/api/auth/logout", {});
  }

  function me() {
    return fetch(apiBaseUrl() + "/api/auth/me", { credentials: "include" }).then(function (res) {
      if (!res.ok) {
        throw new Error("Not authenticated");
      }
      return res.json();
    });
  }

  App.auth = {
    login: login,
    completeNewPassword: completeNewPassword,
    completeMfa: completeMfa,
    forgotPassword: forgotPassword,
    confirmForgotPassword: confirmForgotPassword,
    logout: logout,
    me: me,
  };
})(window.App = window.App || {});
