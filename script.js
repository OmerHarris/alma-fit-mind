const __t = (s) => (window.__afmT ? window.__afmT(s) : s);

// Promo bar dismiss
const promoBarClose = document.getElementById("promoBarClose");
if (promoBarClose) {
  promoBarClose.addEventListener("click", () => {
    document.getElementById("promoBar").style.display = "none";
    localStorage.setItem("promoBarDismissed", "1");
  });
}

// Cookie banner
const cookieBannerAccept = document.getElementById("cookieBannerAccept");
if (cookieBannerAccept) {
  cookieBannerAccept.addEventListener("click", () => {
    document.getElementById("cookieBanner").style.display = "none";
    localStorage.setItem("cookieConsent", "1");
  });
}

// Scroll-reveal animations (progressive enhancement — elements stay visible if JS fails)
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let revealTargets = Array.from(document.querySelectorAll(
    ".problem-card, .method-card, .service-card, .persona-card, .price-card, " +
    ".journey-list li, .value-item, .faq-item, .photo-banner .wrap > *, .testimonial-card, .result-card, .value-prop, .kitchen-teaser, " +
    ".section > .wrap > .eyebrow, .section > .wrap > h2, .section > .wrap > .section-lead"
  ));

  revealTargets.forEach((el, i) => {
    el.classList.add("reveal");
    el.style.transitionDelay = (i % 3) * 60 + "ms";
  });

  const revealInView = () => {
    const viewportH = window.innerHeight;
    revealTargets = revealTargets.filter((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < viewportH - 60) {
        el.classList.add("revealed");
        return false;
      }
      return true;
    });
    if (revealTargets.length === 0) {
      window.removeEventListener("scroll", revealInView);
      window.removeEventListener("resize", revealInView);
    }
  };

  window.addEventListener("scroll", revealInView, { passive: true });
  window.addEventListener("resize", revealInView, { passive: true });
  revealInView();
}

// Sticky header shrink-on-scroll
const headerEl = document.getElementById("siteHeader");
if (headerEl) {
  const onScroll = () => {
    headerEl.classList.toggle("scrolled", window.scrollY > 40);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

// Mobile nav toggle
const navToggle = document.getElementById("navToggle");
const siteHeader = document.getElementById("siteHeader");

if (navToggle) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteHeader.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  document.querySelectorAll(".main-nav a, .header-cta a").forEach((link) => {
    link.addEventListener("click", () => {
      siteHeader.classList.remove("nav-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

// FAQ accordion
document.querySelectorAll(".faq-item").forEach((item) => {
  const btn = item.querySelector(".faq-q");
  const answer = item.querySelector(".faq-a");

  btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";

    document.querySelectorAll(".faq-q").forEach((otherBtn) => {
      if (otherBtn !== btn) {
        otherBtn.setAttribute("aria-expanded", "false");
        otherBtn.closest(".faq-item").querySelector(".faq-a").style.maxHeight = null;
      }
    });

    btn.setAttribute("aria-expanded", String(!expanded));
    answer.style.maxHeight = expanded ? null : answer.scrollHeight + "px";
  });
});

// Carousels — drag-to-swipe (mouse) + arrow buttons; touch swipes natively
document.querySelectorAll("[data-carousel]").forEach((carousel) => {
  const track = carousel.querySelector("[data-track]");
  if (!track) return;
  const prev = carousel.querySelector(".carousel-prev");
  const next = carousel.querySelector(".carousel-next");

  const step = () => {
    const card = track.firstElementChild;
    const gap = parseFloat(getComputedStyle(track).gap) || 24;
    return card ? card.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
  };

  const update = () => {
    const max = track.scrollWidth - track.clientWidth;
    const overflow = max > 4;
    if (prev) prev.hidden = !overflow || track.scrollLeft <= 4;
    if (next) next.hidden = !overflow || track.scrollLeft >= max - 4;
  };

  if (prev) prev.addEventListener("click", () => track.scrollBy({ left: -step() }));
  if (next) next.addEventListener("click", () => track.scrollBy({ left: step() }));
  track.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
  // update once images load and change scrollWidth
  track.querySelectorAll("img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", update, { once: true });
  });

  // Drag to scroll with a mouse/pen (touch already scrolls natively)
  let down = false, startX = 0, startScroll = 0, moved = false;
  track.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return;
    down = true;
    moved = false;
    startX = e.clientX;
    startScroll = track.scrollLeft;
    track.classList.add("dragging");
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    track.scrollLeft = startScroll - dx;
  });
  const end = (e) => {
    if (!down) return;
    down = false;
    track.classList.remove("dragging");
    try { track.releasePointerCapture(e.pointerId); } catch (err) {}
    update();
  };
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
  // Swallow the click that follows a drag so cards/links don't fire
  track.addEventListener("click", (e) => {
    if (moved) { e.preventDefault(); e.stopPropagation(); }
  }, true);
});

// Lead magnet — free guide
const leadForm = document.getElementById("leadForm");
const leadNote = document.getElementById("leadNote");
const guideContent = document.getElementById("guideContent");

if (leadForm) {
  leadForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const submitBtn = leadForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = __t("Sending…");
    leadNote.textContent = "";

    const email = document.getElementById("leadEmail").value;

    try {
      await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch (err) {
      // Reveal the guide regardless — the lead notification is best-effort only.
    }

    leadNote.textContent = __t("Here's your guide — bookmark this page to come back to it anytime.");
    guideContent.hidden = false;
    guideContent.scrollIntoView({ behavior: "smooth", block: "start" });
    leadForm.reset();
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  });
}

// Contact form
const contactForm = document.getElementById("contactForm");
const formNote = document.getElementById("formNote");

if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = __t("Sending…");
    formNote.textContent = "";

    const payload = {
      name: document.getElementById("name").value,
      phone: document.getElementById("phone").value,
      email: document.getElementById("email").value,
      goal: document.getElementById("goal").value,
      callConsent: document.getElementById("callConsent").checked,
      vmConsent: document.getElementById("vmConsent").checked,
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        formNote.textContent = __t("Thanks! Alma will reach out to you soon.");
        contactForm.reset();
      } else {
        formNote.textContent = data.error || __t("Something went wrong. Please try again shortly.");
      }
    } catch (err) {
      formNote.textContent = __t("Something went wrong. Please try again shortly.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

// ---------- Pricing cards: layered 3D photo headers ----------
// Strictly scroll-linked: layers move only while the visitor scrolls.
(function () {
  var cards = Array.prototype.slice.call(document.querySelectorAll(".price-pop"));
  if (!cards.length) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var ticking = false;
  function frame() {
    ticking = false;
    cards.forEach(function (card) {
      var r = card.getBoundingClientRect();
      var o = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
      if (Math.abs(o) > 1.2) return;
      card.querySelector(".pp-bg").style.transform =
        "translate3d(0," + o * 15 + "%,0) scale(1.06)";
      card.querySelector(".pp-word").style.transform = "translate3d(0," + o * -22 + "%,0)";
      card.querySelector(".pp-cutout").style.transform =
        "translate3d(0," + o * -34 + "%,0) scale(" + (1.02 - o * 0.08) + ")";
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  frame();
})();

// ---------- Power band: cinematic film frame ----------
// Every layer is tied to scroll position — nothing animates on its own.
(function () {
  var stage = document.querySelector(".power-cine .pc-stage");
  if (!stage) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var bg = stage.querySelector(".pc-bg");
  var ray = stage.querySelector(".pc-ray");
  var flare = stage.querySelector(".pc-flare");
  var echo = stage.querySelector(".pc-echo");
  var rimGold = stage.querySelector(".pc-rim-gold");
  var rimCyan = stage.querySelector(".pc-rim-cyan");
  var cut = stage.querySelector(".pc-cut");
  var rule = stage.querySelector(".pc-rule");
  var dustA = stage.querySelector(".pc-dust-a");
  var dustB = stage.querySelector(".pc-dust-b");
  var barTop = stage.querySelector(".pc-bar-top");
  var barBot = stage.querySelector(".pc-bar-bot");
  if (!bg || !cut) return;

  var ticking = false;
  function frame() {
    ticking = false;
    var r = stage.getBoundingClientRect();
    var o = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
    if (Math.abs(o) > 1.3) return;

    bg.style.transform = "translate3d(0," + o * 11 + "%,0) scale(1.08)";
    ray.style.transform = "translate3d(" + o * -6 + "%," + o * 24 + "%,0)";
    flare.style.transform = "translate3d(0," + o * 30 + "%,0)";
    flare.style.opacity = String(Math.max(0, 1 - Math.abs(o) * 1.5));

    // aura and both rim lights ride with her so the edge light stays glued on
    var scale = 1.04 - o * 0.07;
    var lift = o * -9;
    echo.style.transform = "translate3d(0," + lift + "%,0) scale(" + (scale + 0.035) + ")";
    rimGold.style.transform = "translate3d(" + (lift - 0.7) + "%," + (lift - 0.9) + "%,0) scale(" + scale + ")";
    rimCyan.style.transform = "translate3d(" + (lift + 0.9) + "%," + (lift - 0.3) + "%,0) scale(" + scale + ")";
    cut.style.transform = "translate3d(0," + lift + "%,0) scale(" + scale + ")";

    if (rule) rule.style.transform = "scaleX(" + Math.max(0.04, 1 - Math.abs(o) * 1.15) + ")";
    dustA.style.transform = "translate3d(0," + o * -34 + "%,0)";
    dustB.style.transform = "translate3d(0," + o * -62 + "%,0)";

    // anamorphic bars breathe closed as the shot leaves centre
    var bar = Math.abs(o) * 26;
    barTop.style.transform = "translate3d(0," + -bar + "%,0)";
    barBot.style.transform = "translate3d(0," + bar + "%,0)";
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  frame();
})();
