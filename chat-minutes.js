// Alma's private paid chat — available site-wide for as long as the visitor
// has minutes left. Loads the Tawk widget, shows the countdown pill, and keeps
// the balance in sync across pages, refreshes and tab switches.
// Fairness/UX aid — Alma's Stripe records remain the source of truth.
(function () {
  if (window.self !== window.top) return; // never inside the assistant iframe

  var T = function (s) { return window.__afmT ? window.__afmT(s) : s; };
  var BAL_KEY = "afmChatBalance";           // seconds remaining
  var PENDING_KEY = "afmPendingPack";       // {m, t} buy-click note (fallback only)
  var STATE_KEY = "afmChatActive";          // {t, replied, counting, runSince}
  var PAUSED_KEY = "afmChatPaused";         // Alma's pause
  var CREDITED_KEY = "afmCreditedSessions"; // Stripe sessions already credited
  var TAWK_ID = "6a629ffdab56b61d4772487e/1ju8k1u43";

  // A conversation with no messages either way for this long is over, so the
  // clock stops even if a page was left open.
  var IDLE_LIMIT = 15 * 60 * 1000;

  // TESTING MODE: credit tiny durations instead of the real minutes.
  var TEST_MODE = false;
  var TEST_SECONDS = { 5: 75, 10: 80, 20: 85, 30: 90 };
  function packSeconds(m) {
    if (TEST_MODE && TEST_SECONDS[m]) return TEST_SECONDS[m];
    return m * 60;
  }

  // ---- Balance -----------------------------------------------------------
  function readBalance() {
    var n = Number(localStorage.getItem(BAL_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  function writeBalance(sec) {
    try { localStorage.setItem(BAL_KEY, String(Math.max(0, Math.floor(sec)))); } catch (e) {}
  }
  // Spending must never raise the stored balance — otherwise a second tab (or
  // a stale page) could write back time that has already been used.
  function writeSpent(sec) {
    writeBalance(Math.min(Math.floor(sec), readBalance()));
  }

  // ---- Conversation state (survives page changes) ------------------------
  function readState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch (e) { return null; }
  }
  function saveState(patch) {
    var s = readState() || {};
    if (patch) { for (var k in patch) s[k] = patch[k]; }
    try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function clearState() {
    try { localStorage.removeItem(STATE_KEY); } catch (e) {}
  }
  function touchState(patch) {
    var p = patch || {};
    p.t = Date.now(); // last message from either side
    saveState(p);
  }
  function readPaused() {
    try { return localStorage.getItem(PAUSED_KEY) === "1"; } catch (e) { return false; }
  }
  function writePaused(on) {
    try {
      if (on) localStorage.setItem(PAUSED_KEY, "1");
      else localStorage.removeItem(PAUSED_KEY);
    } catch (e) {}
  }

  // ---- Credit a purchase -------------------------------------------------
  // The pack size travels in Stripe's redirect (&m=5) so the credit follows the
  // payment, not a note in the browser that can expire. &session_id makes each
  // payment creditable exactly once.
  var balance = readBalance();
  var params = new URLSearchParams(location.search);
  var paidArrival = params.get("paid") === "1";
  var urlMinutes = Number(params.get("m"));
  var sessionId = params.get("session_id") || "";
  var VALID_PACKS = [5, 10, 20, 30];

  function creditedSessions() {
    try { return JSON.parse(localStorage.getItem(CREDITED_KEY) || "[]") || []; } catch (e) { return []; }
  }
  function rememberSession(id) {
    if (!id) return;
    var list = creditedSessions();
    if (list.indexOf(id) === -1) {
      list.push(id);
      if (list.length > 50) list = list.slice(-50);
      try { localStorage.setItem(CREDITED_KEY, JSON.stringify(list)); } catch (e) {}
    }
  }
  function credit(minutes) {
    balance += packSeconds(minutes);
    writeBalance(balance);
  }

  if (paidArrival) {
    var alreadyCredited = !!sessionId && creditedSessions().indexOf(sessionId) !== -1;
    if (!alreadyCredited) {
      if (VALID_PACKS.indexOf(urlMinutes) !== -1) {
        credit(urlMinutes);
        rememberSession(sessionId);
        try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
      } else {
        // Fallback for links that don't carry the pack size yet.
        try {
          var pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
          if (pending && pending.m > 0 && Date.now() - pending.t < 24 * 60 * 60 * 1000) {
            credit(pending.m);
            rememberSession(sessionId);
          }
          localStorage.removeItem(PENDING_KEY);
        } catch (e) {}
      }
    }
    // Drop the query string so a refresh can't credit the same payment twice.
    try {
      if (window.history && history.replaceState) history.replaceState({}, "", location.pathname);
    } catch (e) {}
  } else {
    try {
      var stale = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
      if (stale && stale.t && Date.now() - stale.t > 24 * 60 * 60 * 1000) localStorage.removeItem(PENDING_KEY);
    } catch (e) {}
  }

  var onChatRoom = /exclusive-chat\.html$/.test(location.pathname);

  // No minutes? Stay out of the way everywhere except the chat room itself.
  if (balance <= 0 && !onChatRoom) return;

  var chatting = false;            // the clock is running
  var waiting = false;             // chat open, Alma hasn't replied yet
  var pausedByAlma = readPaused();
  var runSince = null;             // wall-clock ms when the clock last started

  // ---- Wall-clock accounting ---------------------------------------------
  // Time is charged from real elapsed time, not from tick counts: browsers
  // throttle timers in background tabs, so counting ticks would under-charge
  // and stall whenever the visitor switched away.
  function spendUntil(stopAt, from) {
    var spent = Math.floor((stopAt - from) / 1000);
    if (spent <= 0) return 0;
    balance = Math.max(0, balance - spent);
    writeSpent(balance);
    return spent;
  }
  // Charge the gap while another page (or a closed tab) held the session, and
  // report whether the conversation is still alive.
  function settleGap() {
    var s = readState();
    if (!s || !s.counting || !s.runSince) return false;
    var now = Date.now();
    var lastMsg = s.t || s.runSince;
    var endsAt = lastMsg + IDLE_LIMIT;      // silence for this long ends it
    spendUntil(Math.min(now, endsAt), s.runSince);
    return now < endsAt;
  }
  function startClock() {
    runSince = Date.now();
    chatting = true;
    waiting = false;
    saveState({ counting: true, runSince: runSince });
  }
  function stopClock() {
    if (runSince !== null) spendUntil(Date.now(), runSince);
    runSince = null;
    chatting = false;
    saveState({ counting: false, runSince: null });
  }

  // ---- Timer pill --------------------------------------------------------
  var pill = document.createElement("div");
  pill.className = "chat-timer-pill";
  pill.innerHTML = '<span class="chat-timer-clock">⏱</span><span class="chat-timer-time"></span><span class="chat-timer-status"></span>';
  function mountPill() {
    if (document.body) document.body.appendChild(pill);
    else document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(pill); });
  }
  mountPill();
  var timeEl = pill.querySelector(".chat-timer-time");
  var statusEl = pill.querySelector(".chat-timer-status");

  pill.addEventListener("click", function () {
    if (balance <= 0) window.location.href = "/exclusive.html";
  });

  function lockChat() {
    try {
      if (window.Tawk_API.endChat) window.Tawk_API.endChat();
      if (window.Tawk_API.minimize) window.Tawk_API.minimize();
      if (window.Tawk_API.hideWidget) window.Tawk_API.hideWidget();
    } catch (e) {}
  }

  var overlay = null;
  function showTimeUp() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "chat-timeup-overlay";
    overlay.innerHTML =
      '<div class="chat-timeup-card">' +
      "<h3>" + T("Your minutes are used up 💛") + "</h3>" +
      "<p>" + T("Want more time with Alma? Add another pack and keep going.") + "</p>" +
      '<a class="btn btn-primary" href="/exclusive.html">' + T("Top up minutes") + "</a>" +
      '<button type="button" class="chat-timeup-close">' + T("Close") + "</button>" +
      "</div>";
    document.body.appendChild(overlay);
    overlay.querySelector(".chat-timeup-close").addEventListener("click", function () {
      overlay.remove();
      overlay = null;
    });
  }
  function outOfTime() {
    stopClock();
    clearState();
    writePaused(false);
    lockChat();
    showTimeUp();
  }

  function fmt(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function render() {
    timeEl.textContent = fmt(balance);
    pill.classList.toggle("is-done", balance <= 0);
    pill.classList.toggle("is-live", chatting && !pausedByAlma && balance > 0);
    if (balance <= 0) statusEl.textContent = T("Time's up — tap to top up 💛");
    else if (pausedByAlma) statusEl.textContent = T("Paused by Alma 💛");
    else if (chatting) statusEl.textContent = T("Chatting");
    else if (waiting) statusEl.textContent = T("Waiting for Alma — not counting yet");
    else statusEl.textContent = T("Starts when Alma replies");
  }

  // Pick a running conversation straight back up on a new page — before the
  // chat widget has even booted.
  (function resumeOnLoad() {
    var stillLive = settleGap();
    if (balance <= 0) { clearState(); return; }
    if (stillLive && !pausedByAlma) startClock();
    else if (stillLive && pausedByAlma) { chatting = true; saveState({ counting: true, runSince: null }); }
    else if (!stillLive) clearState();
  })();

  // ---- Tawk hooks --------------------------------------------------------
  window.Tawk_API = window.Tawk_API || {};
  function elevate() { if (document.body) document.body.appendChild(pill); }

  window.Tawk_API.onLoad = function () {
    elevate();
    if (balance <= 0) {
      lockChat();
      setTimeout(lockChat, 1500);
    }
    render();
  };

  // Keep the pill inside the *visible* viewport when the phone keyboard is up.
  var vv = window.visualViewport;
  function pinPill() {
    if (pill.classList.contains("chat-open") && vv) {
      pill.style.top = Math.round(vv.offsetTop + 62) + "px";
    } else {
      pill.style.top = "";
    }
  }
  if (vv) {
    vv.addEventListener("resize", pinPill);
    vv.addEventListener("scroll", pinPill);
  }

  window.Tawk_API.onChatMaximized = function () {
    if (balance <= 0) { lockChat(); return; }
    elevate();
    pill.classList.add("chat-open");
    pinPill();
  };
  window.Tawk_API.onChatMinimized = function () { pill.classList.remove("chat-open"); pinPill(); };
  window.Tawk_API.onChatHidden = function () { pill.classList.remove("chat-open"); pinPill(); };

  window.Tawk_API.onChatStarted = function () {
    touchState();
    if (!chatting && !pausedByAlma) waiting = true;
    render();
    try { window.Tawk_API.addEvent("chat-minutes", { remaining: fmt(balance) }, function () {}); } catch (e) {}
  };
  window.Tawk_API.onChatMessageVisitor = function () { touchState(); };

  // Alma's controls, typed as ordinary chat messages. Tawk often replaces an
  // emoji with an <img> whose URL carries the codepoint (🛑 -> 1f6d1), so match
  // the raw markup as well as the plain text.
  var PAUSE_TOKENS = ["!pause", "🛑", "✋", "⏸", "1f6d1", "270b", "23f8"];
  var RESUME_TOKENS = ["!resume", "✅", "🟢", "▶", "2705", "1f7e2", "25b6"];
  function agentCommand(msg) {
    var raw = "";
    if (typeof msg === "string") raw = msg;
    else if (msg) raw = String(msg.message || msg.text || msg.body || "");
    raw = raw.toLowerCase();
    var text = raw.replace(/<[^>]*>/g, " ");
    function has(tokens) {
      for (var i = 0; i < tokens.length; i++) {
        if (text.indexOf(tokens[i]) !== -1 || raw.indexOf(tokens[i]) !== -1) return true;
      }
      return false;
    }
    var add = text.match(/!add\s*(\d{1,3})/) || raw.match(/!add\s*(\d{1,3})/);
    if (add) {
      var n = Number(add[1]) || 0;
      if (n > 0) return { add: Math.min(n, 120) }; // capped so a typo can't gift hours
    }
    if (has(PAUSE_TOKENS)) return "pause";
    if (has(RESUME_TOKENS)) return "resume";
    return null;
  }

  window.Tawk_API.onChatMessageAgent = function (message) {
    touchState({ replied: true });
    var cmd = agentCommand(message);

    if (cmd && cmd.add) {
      var wasEmpty = balance <= 0;
      balance += cmd.add * 60;
      writeBalance(balance);
      if (wasEmpty) {
        pausedByAlma = false;
        writePaused(false);
        if (overlay) { overlay.remove(); overlay = null; }
        try { if (window.Tawk_API.showWidget) window.Tawk_API.showWidget(); } catch (e) {}
      }
      if (!pausedByAlma) startClock();
      render();
      return;
    }
    if (cmd === "pause") {
      pausedByAlma = true;
      writePaused(true);
      stopClock();
      chatting = true;                                  // still her conversation
      saveState({ counting: true, runSince: null });    // frozen, not finished
      render();
      return;
    }
    if (cmd === "resume") {
      pausedByAlma = false;
      writePaused(false);
      startClock();
      render();
      return;
    }
    if (!pausedByAlma) startClock();
    render();
  };

  window.Tawk_API.onChatEnded = function () {
    stopClock();
    waiting = false;
    pausedByAlma = false;
    writePaused(false);
    clearState();
    render();
  };

  // Coming back to the tab: settle what was spent while away and redraw.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && chatting && !pausedByAlma && runSince !== null) {
      var spentAway = spendUntil(Date.now(), runSince);
      if (spentAway > 0) {
        runSince += spentAway * 1000;
        saveState({ runSince: runSince });
        if (balance <= 0) outOfTime();
      }
    }
    render();
  });
  window.addEventListener("pagehide", function () {
    if (chatting && !pausedByAlma && runSince !== null) saveState({ runSince: runSince });
  });

  setInterval(function () {
    if (!chatting || pausedByAlma || balance <= 0 || runSince === null) return;
    var now = Date.now();
    var s = readState();
    var lastMsg = (s && s.t) || runSince;
    // Nobody has said anything for a long while — the session is over.
    if (now - lastMsg > IDLE_LIMIT) {
      spendUntil(Math.min(now, lastMsg + IDLE_LIMIT), runSince);
      stopClock();
      clearState();
      render();
      return;
    }
    var spent = spendUntil(now, runSince);
    if (spent > 0) {
      // Advance by exactly what was charged — moving to `now` would drop the
      // sub-second remainder every tick and quietly under-charge.
      runSince += spent * 1000;
      saveState({ runSince: runSince });
      if (balance <= 0) outOfTime();
      render();
    }
  }, 1000);

  render();

  // ---- Load Tawk ---------------------------------------------------------
  // With time left, anywhere on the site. With none left, still load it in the
  // chat room (hidden on load, so they can't keep texting) — that keeps the
  // connection alive so Alma can gift minutes with "!add".
  if (balance > 0 || onChatRoom) {
    window.Tawk_LoadStart = new Date();
    var s1 = document.createElement("script"), s0 = document.getElementsByTagName("script")[0];
    s1.async = true;
    s1.src = "https://embed.tawk.to/" + TAWK_ID;
    s1.charset = "UTF-8";
    s1.setAttribute("crossorigin", "*");
    s0.parentNode.insertBefore(s1, s0);
  }
})();
