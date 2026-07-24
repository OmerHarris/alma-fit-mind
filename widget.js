// Floating "Alma's Assistant" launcher — present on every content page, bottom-right.
(function () {
  if (window.self !== window.top) return;                 // never inside an iframe
  const p = location.pathname;
  if (/\/chat\.html$/.test(p) || /\/kitchen\.html$/.test(p)) return; // chat is itself; kitchen redirects immediately

  // Paid minutes left? Alma's own live chat takes the corner instead of the
  // assistant launcher, so the two widgets never stack.
  try {
    if (Number(localStorage.getItem("afmChatBalance")) > 0) return;
  } catch (e) {}

  const T = (s) => (window.__afmT ? window.__afmT(s) : s);

  const fab = document.createElement("button");
  fab.className = "afm-fab";
  fab.id = "afmFab";
  fab.type = "button";
  fab.setAttribute("aria-label", "Chat with Alma's Assistant");
  fab.innerHTML =
    '<img src="/images/alma-face-portrait.jpg" alt="">' +
    '<span class="afm-fab-dot"></span>';

  const pill = document.createElement("button");
  pill.className = "afm-fab-pill";
  pill.id = "afmPill";
  pill.type = "button";
  pill.innerHTML = "👋 " + T("Chat with Alma") +
    '<span class="afm-pill-x" aria-hidden="true">&times;</span>';

  const panel = document.createElement("div");
  panel.className = "afm-chat-panel";
  panel.id = "afmPanel";
  panel.hidden = true;
  panel.innerHTML =
    '<button class="afm-panel-close" id="afmPanelClose" aria-label="Close chat">&times;</button>' +
    '<iframe class="afm-chat-iframe" title="Alma\'s Assistant" loading="lazy"></iframe>';

  document.body.appendChild(fab);
  document.body.appendChild(pill);
  document.body.appendChild(panel);

  const iframe = panel.querySelector(".afm-chat-iframe");
  let opened = false;

  function openPanel() {
    if (!iframe.src) iframe.src = "/chat.html?embed=1" + (localStorage.getItem("afmLang") === "es" ? "&lang=es" : "");
    panel.hidden = false;
    fab.classList.add("afm-fab-hidden");
    pill.classList.remove("afm-pill-show");
    opened = true;
  }
  function closePanel() {
    panel.hidden = true;
    fab.classList.remove("afm-fab-hidden");
  }

  fab.addEventListener("click", openPanel);
  pill.addEventListener("click", (e) => {
    if (e.target.classList.contains("afm-pill-x")) { pill.classList.remove("afm-pill-show"); pill.dataset.dismissed = "1"; return; }
    openPanel();
  });
  panel.querySelector("#afmPanelClose").addEventListener("click", closePanel);
  window.addEventListener("message", (e) => {
    if (e.data === "afm-close-chat") closePanel();
  });

  // Gentle attention pill after a few seconds (once per session)
  if (!sessionStorage.getItem("afmPillShown")) {
    setTimeout(() => {
      if (!opened && !pill.dataset.dismissed) {
        pill.classList.add("afm-pill-show");
        sessionStorage.setItem("afmPillShown", "1");
      }
    }, 3500);
  }
})();
