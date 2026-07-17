// Alma's Assistant — guided intake chat.
// Deterministic flow so the collected profile comes back clean and structured.
(function () {
  const log = document.getElementById("chatLog");
  const inputArea = document.getElementById("chatInputArea");
  const progressBar = document.getElementById("chatProgress");
  if (!log) return;

  const T = (s) => (window.__afmT ? window.__afmT(s) : s);
  const answers = {};

  // Embedded (inside the floating widget iframe): drop the site chrome, wire close to parent.
  if (new URLSearchParams(location.search).get("embed") === "1") {
    document.body.classList.add("chat-embed");
    const closeLink = document.querySelector(".chat-close");
    if (closeLink) closeLink.addEventListener("click", (e) => { e.preventDefault(); parent.postMessage("afm-close-chat", "*"); });
  }

  // ---- Flow definition -------------------------------------------------
  // types: say | text | number | single | multi | textarea
  const STEPS = [
    { type: "say", text: "Hey there! 👋 I'm Alma's assistant." },
    { type: "say", text: "Alma likes to really get to know you *before* she reaches out — so she can help from the very first message instead of asking generic questions." },
    { type: "say", text: "It takes about 2 minutes, and everything stays private between you and Alma. Let's start simple." },
    { key: "name", type: "text", ask: "What should Alma call you?", placeholder: "Your first name" },
    { key: "age", type: "number", ask: "Nice to meet you{name}! How old are you?", placeholder: "Age", suffix: "years" },
    { key: "height", type: "text", ask: "How tall are you? However's easiest — feet/inches or cm.", placeholder: "e.g. 5'8\" or 173 cm" },
    { key: "weight", type: "text", ask: "And roughly how much do you weigh right now?", placeholder: "e.g. 165 lb or 75 kg", skippable: true },
    { key: "goals", type: "multi", ask: "What are you hoping to achieve? Pick any that fit.", options: ["Lose fat", "Build muscle", "Get stronger", "General fitness & health", "Feel better mentally", "More energy", "Athletic performance", "Something else"] },
    { key: "trainingHistory", type: "single", ask: "How long have you been training?", options: ["I'm just starting", "Less than 6 months", "6–12 months", "1–3 years", "3+ years"] },
    { key: "frequency", type: "single", ask: "How many days a week do you train — or could realistically commit to?", options: ["I don't train yet", "1–2 days", "3–4 days", "5–6 days", "Every day"] },
    { key: "injuries", type: "text", ask: "Any injuries, disabilities, or physical limitations Alma should know about?", placeholder: "Type here, or tap None", skippable: true, skipLabel: "None" },
    { key: "allergies", type: "text", ask: "Any food allergies or intolerances?", placeholder: "Type here, or tap None", skippable: true, skipLabel: "None" },
    { key: "favoriteFood", type: "text", ask: "What's your favorite food? (Alma builds plans around foods you actually love.)", placeholder: "Your favorite meal or food" },
    { key: "alcohol", type: "single", ask: "Do you drink alcohol?", options: ["No", "Occasionally", "Regularly", "Prefer not to say"] },
    { key: "smoke", type: "single", ask: "Do you smoke?", options: ["No", "Sometimes", "Yes", "Prefer not to say"] },
    { key: "drugs", type: "single", ask: "Any recreational drug use Alma should factor in? Totally confidential.", options: ["No", "Occasionally", "Prefer not to say"] },
    { key: "job", type: "text", ask: "What kind of work do you do?", placeholder: "e.g. desk job, nurse, teacher, driver…" },
    { key: "activity", type: "single", ask: "Outside of workouts, how active is your day?", options: ["Mostly sitting", "Moderately active", "On my feet a lot", "Very physical"] },
    { key: "status", type: "single", ask: "What's your relationship status? (Helps Alma understand your schedule and support.)", options: ["Single", "In a relationship", "Married", "Divorced", "Prefer not to say"] },
    { type: "say", text: "Almost done — just how to reach you. 🙌" },
    { key: "contactPlatform", type: "single", ask: "Where's the best place for Alma to message you?", options: ["WhatsApp", "Telegram", "Instagram", "Facebook", "Email / Phone"] },
    { key: "contactHandle", type: "text", ask: "Perfect — what's your {platform} username or number, so she can find you?", placeholder: "Your username or number" },
    { key: "notes", type: "textarea", ask: "Last one — anything else you'd like Alma to know?", placeholder: "Optional…", skippable: true, skipLabel: "Nothing else" },
  ];

  // ---- Rendering helpers ----------------------------------------------
  function scrollDown() { log.scrollTop = log.scrollHeight; }

  function addBubble(role, text) {
    const wrap = document.createElement("div");
    wrap.className = "chat-msg " + role;
    if (role === "bot") {
      const av = document.createElement("img");
      av.className = "chat-msg-avatar";
      av.src = "images/alma-face-portrait.jpg";
      av.alt = "";
      wrap.appendChild(av);
    }
    const b = document.createElement("div");
    b.className = "chat-bubble";
    b.innerHTML = formatText(text);
    wrap.appendChild(b);
    log.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function formatText(t) {
    return t
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*(.+?)\*/g, "<strong>$1</strong>");
  }

  function showTyping() {
    const wrap = document.createElement("div");
    wrap.className = "chat-msg bot";
    wrap.innerHTML =
      '<img class="chat-msg-avatar" src="images/alma-face-portrait.jpg" alt="">' +
      '<div class="chat-bubble chat-typing"><span></span><span></span><span></span></div>';
    log.appendChild(wrap);
    scrollDown();
    return wrap;
  }

  function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function botSay(text) {
    const typing = showTyping();
    await delay(Math.min(1100, 400 + text.length * 12));
    typing.remove();
    addBubble("bot", text);
  }

  function interp(text) {
    return text
      .replace("{name}", answers.name ? ", " + answers.name : "")
      .replace("{platform}", answers.contactPlatform || "there");
  }

  function setProgress(i) {
    const total = STEPS.filter((s) => s.type !== "say").length;
    const done = STEPS.slice(0, i).filter((s) => s.type !== "say").length;
    progressBar.style.width = Math.round((done / total) * 92) + "%";
  }

  // ---- Input controls --------------------------------------------------
  function clearInput() { inputArea.innerHTML = ""; }

  function askText(step) {
    return new Promise((resolve) => {
      clearInput();
      const form = document.createElement("form");
      form.className = "chat-textfield";
      const isArea = step.type === "textarea";
      const field = document.createElement(isArea ? "textarea" : "input");
      if (!isArea) field.type = step.type === "number" ? "number" : "text";
      if (isArea) field.rows = 2;
      field.className = "chat-field-input";
      field.placeholder = T(step.placeholder || "Type your answer…");
      if (step.type === "number") { field.min = "1"; field.inputMode = "numeric"; }
      const send = document.createElement("button");
      send.type = "submit";
      send.className = "chat-send";
      send.setAttribute("aria-label", "Send");
      send.innerHTML = "&uarr;";
      form.appendChild(field);
      form.appendChild(send);
      inputArea.appendChild(form);

      if (step.skippable) {
        const skip = document.createElement("button");
        skip.type = "button";
        skip.className = "chat-skip";
        skip.textContent = T(step.skipLabel || "Skip");
        skip.addEventListener("click", () => resolve(step.skipLabel || "Skipped"));
        inputArea.appendChild(skip);
      }
      field.focus();
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = field.value.trim();
        if (!v) { field.focus(); return; }
        resolve(v);
      });
      if (isArea) {
        field.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
        });
      }
    });
  }

  function askSingle(step) {
    return new Promise((resolve) => {
      clearInput();
      const chips = document.createElement("div");
      chips.className = "chat-chips";
      step.options.forEach((opt) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chat-chip";
        b.textContent = T(opt);
        b.addEventListener("click", () => resolve(opt));
        chips.appendChild(b);
      });
      inputArea.appendChild(chips);
    });
  }

  function askMulti(step) {
    return new Promise((resolve) => {
      clearInput();
      const picked = new Set();
      const chips = document.createElement("div");
      chips.className = "chat-chips";
      step.options.forEach((opt) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chat-chip";
        b.textContent = T(opt);
        b.addEventListener("click", () => {
          if (picked.has(opt)) { picked.delete(opt); b.classList.remove("selected"); }
          else { picked.add(opt); b.classList.add("selected"); }
          cont.disabled = picked.size === 0;
        });
        chips.appendChild(b);
      });
      const cont = document.createElement("button");
      cont.type = "button";
      cont.className = "btn btn-primary btn-sm chat-continue";
      cont.textContent = T("Continue");
      cont.disabled = true;
      cont.addEventListener("click", () => resolve([...picked]));
      inputArea.appendChild(chips);
      inputArea.appendChild(cont);
    });
  }

  function displayOf(step, ans) {
    if (Array.isArray(ans)) return ans.map(T).join(", ");
    return T(ans);
  }

  // ---- Final confirm + send -------------------------------------------
  function finalConfirm() {
    return new Promise((resolve) => {
      clearInput();
      const box = document.createElement("div");
      box.className = "chat-confirm";
      box.innerHTML =
        '<label class="chat-consent"><input type="checkbox" id="chatConsent">' +
        '<span>' + formatText(interp(T("I'm happy for Alma to reach out to me on {platform}."))) + "</span></label>" +
        '<button type="button" class="btn btn-primary btn-block" id="chatSend" disabled>' + T("Send to Alma") + "</button>" +
        '<p class="chat-send-note" id="chatSendNote" role="status"></p>';
      inputArea.appendChild(box);
      const cb = box.querySelector("#chatConsent");
      const btn = box.querySelector("#chatSend");
      const note = box.querySelector("#chatSendNote");
      cb.addEventListener("change", () => { btn.disabled = !cb.checked; });
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        note.textContent = T("Sending…");
        answers.contactConsent = true;
        try {
          const res = await fetch("/api/intake", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(answers),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) { resolve(true); }
          else { note.textContent = data.error || T("Something went wrong. Please try again shortly."); btn.disabled = false; }
        } catch (e) {
          note.textContent = T("Something went wrong. Please try again shortly.");
          btn.disabled = false;
        }
      });
    });
  }

  // ---- Runner ----------------------------------------------------------
  async function run() {
    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i];
      setProgress(i);
      if (step.type === "say") { await botSay(interp(step.text)); await delay(250); continue; }
      await botSay(interp(step.ask));
      let ans;
      if (step.type === "single") ans = await askSingle(step);
      else if (step.type === "multi") ans = await askMulti(step);
      else ans = await askText(step);
      answers[step.key] = ans;
      addBubble("user", displayOf(step, ans));
      clearInput();
      await delay(200);
    }
    // Review + consent
    setProgress(STEPS.length);
    await botSay(interp(T("That's everything, {name} — thank you! One last thing before I pass this to Alma:")));
    await finalConfirm();
    // Success
    progressBar.style.width = "100%";
    clearInput();
    await botSay(interp(T("All set! 🎉 Alma now has a real picture of you and will reach out personally on {platform} soon.")));
    await botSay(T("In the meantime, feel free to look around the site. Talk soon! 💛"));
    inputArea.innerHTML =
      '<div class="chat-done-actions">' +
      '<a class="btn btn-outline btn-sm" href="/#pricing">' + T("See Coaching Packages") + "</a>" +
      '<a class="btn btn-ghost btn-sm" href="/">' + T("Back to Home") + "</a></div>";
  }

  // Kick off once i18n has had a chance to set language
  run();
})();
