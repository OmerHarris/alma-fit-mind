// Alma's private paid chat — available site-wide for as long as the visitor
// has minutes left. Loads the Tawk widget, shows the countdown pill, and keeps
// the balance in sync across pages and refreshes.
// Fairness/UX aid — Alma's Stripe records remain the source of truth.
(function () {
  if (window.self !== window.top) return; // never inside the assistant iframe

  var T = function (s) { return window.__afmT ? window.__afmT(s) : s; };
  var BAL_KEY = "afmChatBalance";      // seconds remaining
  var PENDING_KEY = "afmPendingPack";  // {m: minutes, t: buy-click time}
  var ACTIVE_KEY = "afmChatActive";    // {t: last message time} — survives refreshes
  var TAWK_ID = "6a629ffdab56b61d4772487e/1ju8k1u43";

  // TESTING MODE: credit tiny durations instead of the real minutes.
  // Set to true only while testing the flow end to end.
  var TEST_MODE = false;
  var TEST_SECONDS = { 5: 75, 10: 80, 20: 85, 30: 90 };
  function packSeconds(m) {
    if (TEST_MODE && TEST_SECONDS[m]) return TEST_SECONDS[m];
    return m * 60;
  }

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

  // Credit a freshly bought pack — but only when arriving from Stripe's
  // post-payment redirect (?paid=1), so backing out of checkout or opening
  // the chat room directly never credits time.
  var balance = readBalance();
  var paidArrival = new URLSearchParams(location.search).get("paid") === "1";
  try {
    var pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    if (paidArrival && pending && pending.m > 0 && Date.now() - pending.t < 2 * 60 * 60 * 1000) {
      balance += packSeconds(pending.m);
      writeBalance(balance);
    }
    if (paidArrival || pending) localStorage.removeItem(PENDING_KEY);
  } catch (e) {}

  var onChatRoom = /exclusive-chat\.html$/.test(location.pathname);

  // No minutes? Stay out of the way everywhere except the chat room itself,
  // where the pill offers a way to top up.
  if (balance <= 0 && !onChatRoom) return;

  var chatting = false;     // counting — begins with Alma's first reply
  var waiting = false;      // visitor opened a chat, Alma hasn't replied yet
  var pausedByAlma = false; // Alma sent !pause; only !resume restarts the clock

  // ---- Conversation state that survives a page refresh -------------------
  function markActive() {
    try { localStorage.setItem(ACTIVE_KEY, JSON.stringify({ t: Date.now() })); } catch (e) {}
  }
  function clearActive() {
    try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
  }
  // Resume counting after a reload only for a genuinely live conversation:
  // recent activity, and Tawk confirming the chat is still ongoing.
  function shouldResume() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null"); } catch (e) {}
    if (!saved || !saved.t || Date.now() - saved.t > 30 * 60 * 1000) return false;
    if (window.Tawk_API && typeof window.Tawk_API.isChatOngoing === "function") {
      try { return !!window.Tawk_API.isChatOngoing(); } catch (e) {}
    }
    return true;
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

  // Out of time? The pill leads to the top-up page — minutes are only ever
  // credited through a completed Stripe checkout.
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

  function fmt(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function render() {
    timeEl.textContent = fmt(balance);
    pill.classList.toggle("is-done", balance <= 0);
    pill.classList.toggle("is-live", chatting && !pausedByAlma && balance > 0 && document.visibilityState === "visible");
    if (balance <= 0) statusEl.textContent = T("Time's up — tap to top up 💛");
    else if (pausedByAlma) statusEl.textContent = T("Paused by Alma 💛");
    else if (waiting) statusEl.textContent = T("Waiting for Alma — not counting yet");
    else if (!chatting) statusEl.textContent = T("Starts when Alma replies");
    else if (document.visibilityState !== "visible") statusEl.textContent = T("Paused — return to this tab");
    else statusEl.textContent = T("Chatting");
  }

  // ---- Tawk hooks --------------------------------------------------------
  window.Tawk_API = window.Tawk_API || {};
  // Keep the pill painted above Tawk's widget (same max z-index — the later
  // DOM node wins).
  function elevate() {
    if (document.body) document.body.appendChild(pill);
  }
  window.Tawk_API.onLoad = function () {
    elevate();
    if (balance <= 0) {
      // No minutes, no chat — and Tawk restores a previously-open panel
      // asynchronously, so lock again shortly after load.
      lockChat();
      setTimeout(lockChat, 1500);
    } else if (shouldResume()) {
      // A refresh (or moving to another page) mid-conversation shouldn't
      // silently stop the clock.
      chatting = true;
    }
    render();
  };
  // Keep the pill inside the *visible* viewport when the phone keyboard is up:
  // iOS pans/shrinks the visual viewport and fixed elements can end up outside
  // the visible strip, so re-pin the pill to the visual viewport's top edge.
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
    if (balance <= 0) { lockChat(); return; } // out of time: panel may not reopen
    elevate();
    pill.classList.add("chat-open");
    pinPill();
  };
  window.Tawk_API.onChatMinimized = function () { pill.classList.remove("chat-open"); pinPill(); };
  window.Tawk_API.onChatHidden = function () { pill.classList.remove("chat-open"); pinPill(); };
  window.Tawk_API.onChatStarted = function () {
    // Visitor opened the conversation — don't count yet; Alma may be away.
    waiting = true;
    markActive();
    render();
    // Best effort: let Alma see the visitor's remaining time in her dashboard.
    try { window.Tawk_API.addEvent("chat-minutes", { remaining: fmt(balance) }, function () {}); } catch (e) {}
  };
  window.Tawk_API.onChatMessageVisitor = function () { markActive(); };

  // The clock starts once Alma sends her first message — and Alma can control
  // it from inside the chat: "!pause" (🛑 / ✋) freezes the timer, "!resume"
  // (✅ / 🟢) restarts it. Only agent messages reach this handler, so visitors
  // can't trigger the commands themselves.
  function agentCommand(msg) {
    // Tawk's payload shape varies — accept a raw string or an object with a
    // message/text/body field, strip any HTML, and match by "contains".
    var m = "";
    if (typeof msg === "string") m = msg;
    else if (msg) m = String(msg.message || msg.text || msg.body || "");
    m = m.replace(/<[^>]*>/g, " ").toLowerCase();
    if (m.indexOf("!pause") !== -1 || m.indexOf("🛑") !== -1 || m.indexOf("✋") !== -1 || m.indexOf("⏸") !== -1) return "pause";
    if (m.indexOf("!resume") !== -1 || m.indexOf("✅") !== -1 || m.indexOf("🟢") !== -1 || m.indexOf("▶") !== -1) return "resume";
    return null;
  }
  window.Tawk_API.onChatMessageAgent = function (message) {
    markActive();
    var cmd = agentCommand(message);
    if (cmd === "pause") { pausedByAlma = true; render(); return; }
    if (cmd === "resume") { pausedByAlma = false; waiting = false; chatting = true; render(); return; }
    waiting = false;
    chatting = true; // a paused clock stays paused until !resume — see tick guard
    render();
  };
  window.Tawk_API.onChatEnded = function () {
    chatting = false; waiting = false; pausedByAlma = false;
    clearActive();
    writeSpent(balance);
    render();
  };
  document.addEventListener("visibilitychange", render);
  window.addEventListener("beforeunload", function () { writeSpent(balance); });

  setInterval(function () {
    if (chatting && !pausedByAlma && balance > 0 && document.visibilityState === "visible") {
      balance--;
      writeSpent(balance);
      if (balance <= 0) {
        chatting = false;
        clearActive();
        lockChat();
        showTimeUp();
      }
      render();
    }
  }, 1000);

  render();

  // ---- Load Tawk (only when there's time to spend) -----------------------
  if (balance > 0) {
    window.Tawk_LoadStart = new Date();
    var s1 = document.createElement("script"), s0 = document.getElementsByTagName("script")[0];
    s1.async = true;
    s1.src = "https://embed.tawk.to/" + TAWK_ID;
    s1.charset = "UTF-8";
    s1.setAttribute("crossorigin", "*");
    s0.parentNode.insertBefore(s1, s0);
  }
})();
