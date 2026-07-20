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
    name: "Name", age: "Age", height: "Height", weight: "Weight", goals: "Goals", why: "Why now",
    trainLocation: "Training location", duration: "Time per day", frequency: "Days per week",
    workoutType: "Workout style", trainingHistory: "Training history",
    motivation: "Motivation", needMotivation: "Wants a push", motivationScale: "Readiness (1–10)",
    injuries: "Injuries", allergies: "Allergies", favoriteFood: "Favorite food",
    alcohol: "Alcohol", smoke: "Smoking", drugs: "Drug use", job: "Job", activity: "Daily activity",
    status: "Relationship status", gender: "Gender",
    contactPlatform: "Contact platform", contactHandle: "Contact info", notes: "Notes",
  };
  function shortLabel(step) { return LABELS[step.key] || step.key; }

  // Embedded (inside the floating widget iframe): drop the site chrome, wire close to parent.
  const IS_EMBED = new URLSearchParams(location.search).get("embed") === "1";
  if (IS_EMBED) {
    document.body.classList.add("chat-embed");
    // Inside the floating widget iframe, any link (Back to Home, See Packages,
    // See this plan…) must open in the parent tab — not load the whole site
    // inside the little chat window.
    document.head.insertAdjacentHTML("afterbegin", '<base target="_top">');
    const closeLink = document.querySelector(".chat-close");
    if (closeLink) closeLink.addEventListener("click", (e) => { e.preventDefault(); parent.postMessage("afm-close-chat", "*"); });
  }

  // ---- Flow definition -------------------------------------------------
  // types: say | text | number | single | multi | textarea
  const STEPS = [
    { type: "say", text: "Hey there! 👋 I'm Alma's assistant — so glad you stopped by." },
    { type: "say", text: "Give me two minutes and a little honesty, and I'll help you find *exactly* which of Alma's plans fits you best. Everything stays private between you and Alma. 💛" },
    { key: "name", type: "text", ask: "First things first — what should Alma call you?", placeholder: "Your first name", maxLength: 40, kind: "name" },
    { key: "age", type: "number", ask: "Before we get into it{name} — how old are you? (Alma only coaches adults, 18 and up.)", placeholder: "Age", suffix: "years", min: 18 },
    { type: "say", text: "Perfect{name} — let's find the plan that's right for you. 💪" },
    { key: "goals", type: "multi", ask: "Which of these best describes your fitness goals? Pick all that apply — no judgment if you want it all. 💪", options: ["Lose fat", "Build muscle", "Get stronger", "General fitness & health", "Feel better mentally", "More energy", "Athletic performance", "Something else"] },
    { key: "why", type: "textarea", ask: "Now tell me something real — *why now*? What made today the day? (Knowing your reason helps Alma keep you going.)", placeholder: "Even one honest line…", skippable: true, skipLabel: "I'd rather tell Alma directly", maxLength: 400 },
    { key: "trainLocation", type: "single", ask: "Where do you prefer to train?", options: ["Gym", "At home", "I don't mind"] },
    { key: "duration", type: "single", ask: "How long can you train each day?", options: ["⏰ 45–60 minutes", "⏰ 30–45 minutes", "⏰ 20–30 minutes"] },
    { key: "frequency", type: "single", ask: "How many times per week do you *want* to train?", options: ["6+ days", "4–5 days", "4 days or less"] },
    { key: "workoutType", type: "single", ask: "What type of strength workouts do you enjoy the most?", options: ["Weight lifting in the gym", "Dynamic full-body movements", "Follow-along home workouts"] },
    { key: "trainingHistory", type: "single", ask: "How long have you been training?", options: ["I'm just starting", "Less than 6 months", "6–12 months", "1–3 years", "3+ years"] },
    { key: "motivation", type: "text", ask: "What keeps you motivated when it gets hard?", placeholder: "Your why, your people, your playlist…", maxLength: 200 },
    { key: "needMotivation", type: "single", ask: "Be honest — do you want Alma in your corner, pushing you?", options: ["Yes, push me!", "A little", "No — I've got that part"] },
    { key: "motivationScale", type: "scale", ask: "On a scale of 1–10, how ready are you to try something new with your training?" },
    { key: "height", type: "text", ask: "A few quick details so Alma can build for *your* body. How tall are you? Feet/inches or cm — whatever's easiest.", placeholder: "e.g. 5'8\" or 173 cm", maxLength: 30 },
    { key: "weight", type: "text", ask: "And roughly where are you at weight-wise right now? No judgment — just a starting point.", placeholder: "e.g. 165 lb or 75 kg", skippable: true, maxLength: 20 },
    { key: "injuries", type: "text", ask: "Any injuries, disabilities, or limitations Alma should know about?", placeholder: "Type here, or tap None", skippable: true, skipLabel: "None", maxLength: 300 },
    { key: "allergies", type: "text", ask: "Any food allergies or intolerances?", placeholder: "Type here, or tap None", skippable: true, skipLabel: "None", maxLength: 200 },
    { key: "favoriteFood", type: "text", ask: "What's a food you'd never give up? (Alma builds plans around foods you actually love.)", placeholder: "Your favorite meal or food", maxLength: 60 },
    { type: "say", text: "A few honest lifestyle questions next — zero judgment, ever. They just help Alma build around your *real* life. 💛" },
    { key: "alcohol", type: "single", ask: "Do you drink alcohol?", options: ["No", "Occasionally", "Regularly", "Prefer not to say"] },
    { key: "smoke", type: "single", ask: "Do you smoke?", options: ["No", "Sometimes", "Yes", "Prefer not to say"] },
    { key: "drugs", type: "single", ask: "Any recreational drug use Alma should factor in? Totally confidential.", options: ["No", "Occasionally", "Prefer not to say"] },
    { key: "job", type: "text", ask: "What kind of work do you do?", placeholder: "e.g. desk job, nurse, teacher, driver…", maxLength: 60 },
    { key: "activity", type: "single", ask: "Outside of workouts, how active is your day?", options: ["Mostly sitting", "Moderately active", "On my feet a lot", "Very physical"] },
    { key: "status", type: "single", ask: "What's your relationship status? (Helps Alma understand your schedule and support.)", options: ["Single", "In a relationship", "Married", "Divorced", "Prefer not to say"] },
    { key: "gender", type: "single", ask: "And what's your gender?", options: ["Woman", "Man", "Non-binary", "Prefer not to say"] },
    { type: "recommend" },
    { key: "contactPlatform", type: "single", ask: "So — where should Alma reach out to you?", options: ["WhatsApp", "Telegram", "Instagram", "Facebook", "Email / Phone"] },
    { key: "contactHandle", type: "text", ask: "Perfect — what's your {platform} so Alma can reach you?", placeholder: "Your username or number", maxLength: 60, kind: "handle" },
    { key: "notes", type: "textarea", ask: "Last one — anything else you want Alma to know?", placeholder: "Optional…", skippable: true, skipLabel: "Nothing else", maxLength: 600 },
  ];

  // ---- Package recommendation -----------------------------------------
  const PLANS = {
    foundations: { name: "Foundations", price: "$49", blurb: "You've clearly got the drive — this hands you Alma's custom program and weekly check-ins to keep that momentum going. The perfect starting line. 💪" },
    transformation: { name: "Transformation", price: "$99", blurb: "This one has your name written all over it. 💪 Real 1:1 coaching, weekly adjustments, and Alma actually in your corner — exactly the support your answers are asking for." },
    elite: { name: "Elite Mind & Body", price: "$199", blurb: "You're clearly all in — and I love it. 🔥 Alma's highest-touch level: weekly 1:1s, fully bespoke programming, and dedicated mindset coaching. Made for someone as committed as you." },
  };
  function recommendPlan(a) {
    let s = 0;
    const g = Array.isArray(a.goals) ? a.goals : [];
    if (a.frequency === "6+ days") s += 2; else if (a.frequency === "4–5 days") s += 1;
    if (typeof a.duration === "string" && a.duration.indexOf("45") >= 0) s += 1;
    const scale = Number(a.motivationScale) || 0;
    if (scale >= 8) s += 2; else if (scale >= 5) s += 1;
    if (a.needMotivation === "Yes, push me!") s += 2; else if (a.needMotivation === "A little") s += 1;
    if (g.indexOf("Feel better mentally") >= 0) s += 1;
    if (g.indexOf("Athletic performance") >= 0) s += 1;
    if (g.length >= 3) s += 1;
    if (a.trainingHistory === "I'm just starting") s += 1;
    if (s >= 7) return "elite";
    if (s >= 3) return "transformation";
    return "foundations";
  }

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

  // ---- Warm, human reactions to what they share -------------------------
  // Returns a translated line (or null) to say right after an answer, so the
  // chat feels like a real coach listening — not a form.
  function reactTo(step, ans) {
    switch (step.key) {
      case "goals":
        return T("Ooh, ambitious — I love that. 💪 Alma coaches training, food, *and* mindset as one system — that's exactly why her people actually get there.");
      case "why":
        if (ans === step.skipLabel) return null;
        return T("*That's* the good stuff. Hold onto that reason — Alma will use it to keep you going when you'd rather quit. 💛");
      case "trainingHistory":
        if (ans === "I'm just starting" || ans === "Less than 6 months")
          return T("Perfect timing — beginners make the fastest, most visible progress once they've got real coaching behind them. You picked the best possible moment.");
        return T("Love it — you've already built a base. Now the fun part: Alma breaks the plateau and makes this next phase your best one yet.");
      case "needMotivation":
        if (ans === "Yes, push me!") return T("Perfect — Alma's going to love that. 💪 Pushing you is her favorite part.");
        if (ans === "A little") return T("Perfect — a nudge when you need it, space when you don't. Alma's great at reading that.");
        return T("A self-starter. 🔥 Alma loves those — she'll just make sure all that fire is aimed the right way.");
      case "motivationScale": {
        const n = Number(ans) || 0;
        if (n >= 8) return T("That energy? I love it. 🔥 Alma is going to love working with you.");
        if (n >= 5) return T("Solid. And honestly, the fact that you're even here says more than a number ever could. 💛");
        return T("Hey — showing up when the spark is low is the real flex. Turning that dial up is literally Alma's job. 💛");
      }
      case "injuries":
        if (ans === step.skipLabel || ans === "None") return null;
        return T("Thank you for trusting me with that. Alma will build your plan *around* it — strong and safe, no shortcuts.");
      case "favoriteFood":
        return T("Noted — and it's staying. 😊 Alma builds plans around foods you actually love. No sad diets on her watch.");
      case "contactHandle":
        return T("Got it! 🙌 Alma will reach out herself — usually within a day or two.");
      default:
        return null;
    }
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

  function askScale(step) {
    return new Promise((resolve) => {
      clearInput();
      const wrap = document.createElement("div");
      wrap.className = "chat-scale";
      for (let n = 1; n <= 10; n++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "chat-scale-btn";
        b.textContent = String(n);
        b.addEventListener("click", () => resolve(String(n)));
        wrap.appendChild(b);
      }
      const labels = document.createElement("div");
      labels.className = "chat-scale-labels";
      labels.innerHTML = "<span>" + T("Not really") + "</span><span>" + T("Let's go 🔥") + "</span>";
      inputArea.appendChild(wrap);
      inputArea.appendChild(labels);
      scrollDown();
    });
  }

  function addPlanCard(plan) {
    const card = document.createElement("div");
    card.className = "chat-plan-card";
    card.innerHTML =
      '<span class="chat-plan-badge">' + T("Your best match") + "</span>" +
      '<h4 class="chat-plan-name">' + T(plan.name) + "</h4>" +
      '<p class="chat-plan-price">' + plan.price + "<span>" + T("/month") + "</span></p>" +
      '<p class="chat-plan-blurb">' + formatText(T(plan.blurb)) + "</p>" +
      '<a class="btn btn-primary btn-sm" href="/#pricing">' + T("See this plan") + "</a>";
    log.appendChild(card);
    scrollDown();
  }

  async function showRecommendation() {
    const key = recommendPlan(answers);
    answers.recommendedPlan = PLANS[key].name;
    await botSay(interp(T("Okay{name}, I've been paying close attention…")));
    await botSay(T("And I know *exactly* which of Alma's plans was made for you:"));
    addPlanCard(PLANS[key]);
    await delay(300);
    await botSay(T("Want Alma to build this one around *you*? Let's get you connected. 👇"));
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
    else if (step.type === "scale") ans = await askScale(step);
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
      if (step.type === "recommend") { await showRecommendation(); await delay(200); continue; }
      await botSay(interp(T(step.ask)));
      let ans;
      if (step.type === "single") ans = await askSingle(step);
      else if (step.type === "multi") ans = await askMulti(step);
      else if (step.type === "scale") ans = await askScale(step);
      else ans = await askText(step);
      answers[step.key] = ans;
      addBubble("user", displayOf(step, ans));
      clearInput();
      if (step.key === "age" && Number(ans) < (step.min || 18)) {
        clearProgress();
        await underageExit();
        return;
      }
      const reaction = reactTo(step, ans);
      if (reaction) await botSay(interp(reaction));
      saveProgress(i + 1);
      await delay(200);
    }
    // Review + consent
    setProgress(STEPS.length);
    await botSay(interp(T("That's everything{name} — and honestly, that's more than most people share on day one. Thank you. 💛 One last thing before I hand you to Alma:")));
    await finalConfirm();
    // Success
    clearProgress();
    progressBar.style.width = "100%";
    clearInput();
    await botSay(interp(T("Done{name}. 🎉 Alma's got the *real* you now — not a form, the whole picture.")));
    await botSay(interp(T("She'll message you on {platform} personally, usually within a day or two. Keep an eye out for her. 💛")));
    await botSay(T("And here's the thing: the people who go furthest with Alma are the ones who decided — *before* her first message — that this time is different. You just did that. 💛"));
    await botSay(T("Go get a closer look at the plan I picked for you while you wait: 👇"));
    inputArea.innerHTML =
      '<div class="chat-done-actions">' +
      '<a class="btn btn-primary btn-sm" href="/#pricing">' + T("See Coaching Packages") + "</a>" +
      '<a class="btn btn-ghost btn-sm" href="/">' + T("Back to Home") + "</a></div>";
    scrollDown();
  }

  // Kick off once i18n has had a chance to set language
  run();
})();
