// Alma's Assistant — guided intake chat.
// Deterministic flow so the collected profile comes back clean and structured.
(function () {
  const log = document.getElementById("chatLog");
  const inputArea = document.getElementById("chatInputArea");
  const progressBar = document.getElementById("chatProgress");
  if (!log) return;

  const T = (s) => (window.__afmT ? window.__afmT(s) : s);
  const answers = {};

  // ---- Progress persistence --------------------------------------------
  const STORAGE_KEY = "afmChatProgress";
  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || !data.answers || typeof data.stepIndex !== "number") return null;
      return data;
    } catch (e) { return null; }
  }
  function saveProgress(stepIndex) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ stepIndex, answers })); } catch (e) {}
  }
  function clearProgress() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  const LABELS = {
    name: "Name", age: "Age", height: "Height", weight: "Weight", goals: "Goals",
    trainingHistory: "Training history", frequency: "Training frequency", injuries: "Injuries",
    allergies: "Allergies", favoriteFood: "Favorite food", alcohol: "Alcohol", smoke: "Smoking",
    drugs: "Drug use", job: "Job", activity: "Daily activity", status: "Relationship status",
    contactPlatform: "Contact platform", contactHandle: "Contact info", notes: "Notes",
  };
  function shortLabel(step) { return LABELS[step.key] || step.key; }

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
    { key: "name", type: "text", ask: "What should Alma call you?", placeholder: "Your first name", maxLength: 40, kind: "name" },
    { key: "age", type: "number", ask: "Nice to meet you{name}! How old are you?", placeholder: "Age", suffix: "years", min: 18 },
    { key: "height", type: "text", ask: "How tall are you? However's easiest — feet/inches or cm.", placeholder: "e.g. 5'8\" or 173 cm", maxLength: 30 },
    { key: "weight", type: "text", ask: "And roughly how much do you weigh right now?", placeholder: "e.g. 165 lb or 75 kg", skippable: true, maxLength: 20 },
    { key: "goals", type: "multi", ask: "What are you hoping to achieve? Pick any that fit.", options: ["Lose fat", "Build muscle", "Get stronger", "General fitness & health", "Feel better mentally", "More energy", "Athletic performance", "Something else"] },
    { key: "trainingHistory", type: "single", ask: "How long have you been training?", options: ["I'm just starting", "Less than 6 months", "6–12 months", "1–3 years", "3+ years"] },
    { key: "frequency", type: "single", ask: "How many days a week do you train — or could realistically commit to?", options: ["I don't train yet", "1–2 days", "3–4 days", "5–6 days", "Every day"] },
    { key: "injuries", type: "text", ask: "Any injuries, disabilities, or physical limitations Alma should know about?", placeholder: "Type here, or tap None", skippable: true, skipLabel: "None", maxLength: 300 },
    { key: "allergies", type: "text", ask: "Any food allergies or intolerances?", placeholder: "Type here, or tap None", skippable: true, skipLabel: "None", maxLength: 200 },
    { key: "favoriteFood", type: "text", ask: "What's your favorite food? (Alma builds plans around foods you actually love.)", placeholder: "Your favorite meal or food", maxLength: 60 },
    { key: "alcohol", type: "single", ask: "Do you drink alcohol?", options: ["No", "Occasionally", "Regularly", "Prefer not to say"] },
    { key: "smoke", type: "single", ask: "Do you smoke?", options: ["No", "Sometimes", "Yes", "Prefer not to say"] },
    { key: "drugs", type: "single", ask: "Any recreational drug use Alma should factor in? Totally confidential.", options: ["No", "Occasionally", "Prefer not to say"] },
    { key: "job", type: "text", ask: "What kind of work do you do?", placeholder: "e.g. desk job, nurse, teacher, driver…", maxLength: 60 },
    { key: "activity", type: "single", ask: "Outside of workouts, how active is your day?", options: ["Mostly sitting", "Moderately active", "On my feet a lot", "Very physical"] },
    { key: "status", type: "single", ask: "What's your relationship status? (Helps Alma understand your schedule and support.)", options: ["Single", "In a relationship", "Married", "Divorced", "Prefer not to say"] },
    { type: "say", text: "Almost done — just how to reach you. 🙌" },
    { key: "contactPlatform", type: "single", ask: "Where's the best place for Alma to message you?", options: ["WhatsApp", "Telegram", "Instagram", "Facebook", "Email / Phone"] },
    { key: "contactHandle", type: "text", ask: "Perfect — what's your {platform} username or number, so she can find you?", placeholder: "Your username or number", maxLength: 60, kind: "handle" },
    { key: "notes", type: "textarea", ask: "Last one — anything else you'd like Alma to know?", placeholder: "Optional…", skippable: true, skipLabel: "Nothing else", maxLength: 600 },
  ];

  // ---- Rendering helpers ----------------------------------------------
  function scrollDown() {
    log.scrollTop = log.scrollHeight;
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  }

  function addBubble(role, text) {
    const wrap = document.createElement("div");
    wrap.className = "chat-msg " + role;
    if (role === "bot") {
      const av = document.createElement("img");
      av.className = "chat-msg-avatar";
      av.src = "images/alma-face-portrait.jpg";
      av.alt = "";
      av.addEventListener("load", scrollDown);
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

  // ---- Input validation (nonsense/abuse guards) -------------------------
  function looksLikeSentence(v) {
    if (/[?!.,;:]/.test(v)) return true;
    return v.trim().split(/\s+/).length > 4;
  }
  function isRepeatedCharSpam(v) {
    const compact = v.replace(/\s+/g, "");
    if (compact.length < 5) return false;
    const counts = {};
    for (const ch of compact) counts[ch] = (counts[ch] || 0) + 1;
    return Math.max(...Object.values(counts)) / compact.length > 0.6;
  }
  function validateAnswer(step, raw) {
    const v = raw.trim();
    if (step.kind === "name") {
      if (looksLikeSentence(v) || isRepeatedCharSpam(v) || !/[a-zA-ZÀ-ÿ]/.test(v)) {
        return T("Just your first name is perfect — what should Alma call you?");
      }
    }
    if (step.kind === "handle") {
      if (isRepeatedCharSpam(v) || v.length < 2) {
        return T("That doesn't look right — mind double-checking it?");
      }
    }
    return null;
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
      if (step.type === "number") {
        field.min = "1";
        field.inputMode = "numeric";
      } else if (step.maxLength) {
        field.maxLength = step.maxLength;
      }
      const send = document.createElement("button");
      send.type = "submit";
      send.className = "chat-send";
      send.setAttribute("aria-label", "Send");
      send.innerHTML = "&uarr;";
      form.appendChild(field);
      form.appendChild(send);
      inputArea.appendChild(form);

      const error = document.createElement("p");
      error.className = "chat-field-error";
      error.hidden = true;
      inputArea.appendChild(error);

      if (step.skippable) {
        const skip = document.createElement("button");
        skip.type = "button";
        skip.className = "chat-skip";
        skip.textContent = T(step.skipLabel || "Skip");
        skip.addEventListener("click", () => resolve(step.skipLabel || "Skipped"));
        inputArea.appendChild(skip);
      }
      scrollDown();
      field.focus();

      function showError(msg) {
        error.textContent = msg;
        error.hidden = false;
        field.focus();
        scrollDown();
      }

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const v = field.value.trim();
        if (!v) { field.focus(); return; }
        if (step.type === "number") {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 1 || n > 120) {
            showError(T("Please enter a valid age."));
            return;
          }
        }
        const err = validateAnswer(step, v);
        if (err) { showError(err); return; }
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
      scrollDown();
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
      scrollDown();
    });
  }

  function displayOf(step, ans) {
    if (Array.isArray(ans)) return ans.map(T).join(", ");
    return T(ans);
  }

  function askChoice(options) {
    return new Promise((resolve) => {
      clearInput();
      const chips = document.createElement("div");
      chips.className = "chat-chips";
      options.forEach((opt) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chat-chip";
        b.textContent = T(opt);
        b.addEventListener("click", () => resolve(opt));
        chips.appendChild(b);
      });
      inputArea.appendChild(chips);
      scrollDown();
    });
  }

  // ---- Resume / review saved progress -----------------------------------
  async function reviewAnswers(savedIndex) {
    const answeredSteps = STEPS.slice(0, savedIndex).filter((s) => s.key && answers[s.key] !== undefined);
    await botSay(T("Sure — tap the question you'd like to change."));
    const labels = answeredSteps.map(shortLabel);
    const choice = await askChoice([...labels, "Back"]);
    if (choice === "Back") return;
    const step = answeredSteps.find((s) => shortLabel(s) === choice);
    if (!step) return;
    addBubble("user", T(choice));
    await botSay(interp(T(step.ask)));
    let ans;
    if (step.type === "single") ans = await askSingle(step);
    else if (step.type === "multi") ans = await askMulti(step);
    else ans = await askText(step);
    answers[step.key] = ans;
    addBubble("user", displayOf(step, ans));
    saveProgress(savedIndex);
    await botSay(T("Got it — updated! 👍"));
  }

  async function resumeOrRestart(savedIndex) {
    await botSay(T("Welcome back! Looks like we were partway through — want to pick up where you left off, or start over?"));
    const choice = await askChoice(["Continue where I left off", "Review my answers", "Start over"]);
    if (choice === "Start over") {
      clearProgress();
      Object.keys(answers).forEach((k) => delete answers[k]);
      return 0;
    }
    if (choice === "Review my answers") {
      await reviewAnswers(savedIndex);
      return resumeOrRestart(savedIndex);
    }
    for (let i = 0; i < savedIndex; i++) {
      const step = STEPS[i];
      if (step.type === "say" || !step.key || answers[step.key] === undefined) continue;
      addBubble("bot", interp(T(step.ask)));
      addBubble("user", displayOf(step, answers[step.key]));
    }
    return savedIndex;
  }

  async function underageExit() {
    await botSay(T("Thanks for being honest about that. Alma's coaching programs are only available to adults 18 and older, so I'm not able to continue this chat with you — nothing you've shared has been sent anywhere. If you're under 18, please have a parent or guardian reach out on Alma's behalf if they're interested."));
    clearInput();
    inputArea.innerHTML =
      '<div class="chat-done-actions">' +
      '<a class="btn btn-ghost btn-sm" href="/">' + T("Back to Home") + "</a></div>";
    scrollDown();
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
      scrollDown();
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
    let startIndex = 0;
    const saved = loadProgress();
    if (saved && saved.stepIndex > 0 && saved.stepIndex < STEPS.length) {
      Object.assign(answers, saved.answers);
      startIndex = await resumeOrRestart(saved.stepIndex);
    }
    for (let i = startIndex; i < STEPS.length; i++) {
      const step = STEPS[i];
      setProgress(i);
      if (step.type === "say") { await botSay(interp(T(step.text))); await delay(250); continue; }
      await botSay(interp(T(step.ask)));
      let ans;
      if (step.type === "single") ans = await askSingle(step);
      else if (step.type === "multi") ans = await askMulti(step);
      else ans = await askText(step);
      answers[step.key] = ans;
      addBubble("user", displayOf(step, ans));
      clearInput();
      if (step.key === "age" && Number(ans) < (step.min || 18)) {
        clearProgress();
        await underageExit();
        return;
      }
      saveProgress(i + 1);
      await delay(200);
    }
    // Review + consent
    setProgress(STEPS.length);
    await botSay(interp(T("That's everything, {name} — thank you! One last thing before I pass this to Alma:")));
    await finalConfirm();
    // Success
    clearProgress();
    progressBar.style.width = "100%";
    clearInput();
    await botSay(interp(T("All set! 🎉 Alma now has a real picture of you and will reach out personally on {platform} soon.")));
    await botSay(T("In the meantime, feel free to look around the site. Talk soon! 💛"));
    inputArea.innerHTML =
      '<div class="chat-done-actions">' +
      '<a class="btn btn-outline btn-sm" href="/#pricing">' + T("See Coaching Packages") + "</a>" +
      '<a class="btn btn-ghost btn-sm" href="/">' + T("Back to Home") + "</a></div>";
    scrollDown();
  }

  // Kick off once i18n has had a chance to set language
  run();
})();
