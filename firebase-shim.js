/* Connects the app to Firebase (Google sign-in + Firestore) through window.claude.use("db"|"user"|"downloads").
   Access list: Firestore collection "allowed", document id = lowercase email, field role = "editor" or "viewer". */
(function () {
  var cfg = window.TSL_FIREBASE_CONFIG || {};
  var configured = !!(cfg.apiKey && cfg.projectId && window.firebase);
  var gate = function () { return document.getElementById("gate"); };
  var MARK = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>';
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function showGate(title, msg, btn, onClick, err) {
    var g = gate(); if (!g) return;
    g.hidden = false;
    g.innerHTML = '<div class="gate-box"><div class="gate-mark">' + MARK + '</div><h2>' + esc(title) + '</h2><p>' + esc(msg) + '</p>' +
      (btn ? '<button class="gate-btn" id="gate-btn">' + esc(btn) + '</button>' : '') + '<div class="gate-err">' + esc(err || "") + '</div></div>';
    if (btn) document.getElementById("gate-btn").onclick = onClick;
  }
  function hideGate() { var g = gate(); if (g) { g.hidden = true; g.innerHTML = ""; } }

  var state = { db: null, auth: null, user: null, role: null };
  var ready = null;

  function init() {
    if (ready) return ready;
    ready = new Promise(function (resolve) {
      if (!configured) return resolve(false);
      try {
        firebase.initializeApp(cfg);
        state.auth = firebase.auth();
        state.db = firebase.firestore();
      } catch (e) { return resolve(false); }

      function signIn() {
        var p = new firebase.auth.GoogleAuthProvider();
        p.setCustomParameters({ prompt: "select_account" });
        state.auth.signInWithPopup(p).catch(function (e) {
          if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment" || e.code === "auth/cancelled-popup-request")) {
            return state.auth.signInWithRedirect(p);
          }
          if (e && e.code !== "auth/popup-closed-by-user") showGate("Team Split Ledger", "Sign in with your Google account to open the shared ledger.", "Sign in with Google", signIn, "Sign-in failed. Try again.");
        });
      }
      function check(user) {
        var email = (user.email || "").toLowerCase();
        state.db.doc("allowed/" + email).get().then(function (s) {
          var role = s.exists ? (s.data().role || "viewer") : null;
          if (!role) {
            showGate("No access", email + " is not on the team list. Ask the owner to add this email, then sign in again.", "Use another account", function () { state.auth.signOut().then(function () { location.reload(); }); });
            return;
          }
          state.user = user; state.role = role; hideGate(); resolve(true);
        }).catch(function () {
          showGate("Could not check access", "Check your connection and try again.", "Retry", function () { check(user); });
        });
      }
      showGate("Team Split Ledger", "Loading…", null);
      state.auth.getRedirectResult().catch(function () {});
      state.auth.onAuthStateChanged(function (u) {
        if (u) check(u);
        else showGate("Team Split Ledger", "Sign in with your Google account to open the shared ledger.", "Sign in with Google", signIn);
      });
    });
    return ready;
  }

  window.tslSignOut = function () {
    if (state.auth) state.auth.signOut().then(function () { location.reload(); }); else location.reload();
  };

  window.claude = window.claude || {};
  window.claude.use = function (name) {
    if (name === "downloads") {
      return Promise.resolve({
        save: function (o) {
          var blob = new Blob([o.data], { type: /\.json$/i.test(o.filename) ? "application/json" : "text/csv;charset=utf-8" });
          var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = o.filename;
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          return Promise.resolve();
        }
      });
    }
    if (name === "db") return init().then(function (ok) { return ok ? state.db : null; });
    if (name === "user") return init().then(function (ok) {
      if (!ok) return null;
      return {
        id: function () { return Promise.resolve(state.user.uid); },
        me: function () { return Promise.resolve({ name: state.user.displayName || state.user.email, avatarUrl: state.user.photoURL || "" }); },
        can: function (p) { return Promise.resolve(p === "data.write" ? state.role === "editor" : true); }
      };
    });
    return Promise.resolve(null);
  };
})();
