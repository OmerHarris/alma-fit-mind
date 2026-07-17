const __t = (s) => (window.__afmT ? window.__afmT(s) : s);
// Calendly loading placeholder — hide it once the real widget iframe appears
const calendlyWidget = document.querySelector(".calendly-inline-widget");
if (calendlyWidget) {
  const hideLoading = () => {
    const loading = calendlyWidget.querySelector(".calendly-loading");
    if (loading) loading.style.display = "none";
  };

  const iframe = calendlyWidget.querySelector("iframe");
  if (iframe) {
    hideLoading();
  } else {
    const observer = new MutationObserver(() => {
      const foundIframe = calendlyWidget.querySelector("iframe");
      if (foundIframe) {
        foundIframe.addEventListener("load", hideLoading, { once: true });
        // Fallback in case the load event doesn't fire as expected
        setTimeout(hideLoading, 2500);
        observer.disconnect();
      }
    });
    observer.observe(calendlyWidget, { childList: true });
  }
}

// Plate chooser modal — pick between the article and the kitchen
const plateModal = document.getElementById("plateModal");
if (plateModal) {
  const openModal = (e) => {
    e.preventDefault();
    plateModal.hidden = false;
    document.body.style.overflow = "hidden";
    plateModal.querySelector(".plate-option").focus();
  };
  const closeModal = () => {
    plateModal.hidden = true;
    document.body.style.overflow = "";
  };

  document.querySelectorAll(".pillar-plate").forEach((el) => {
    el.addEventListener("click", openModal);
  });
  plateModal.querySelectorAll("[data-plate-close]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !plateModal.hidden) closeModal();
  });
}

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

  document.querySelectorAll(".main-nav a").forEach((link) => {
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
      email: document.getElementById("email").value,
      goal: document.getElementById("goal").value,
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        formNote.textContent = __t("Thanks! Your message is on its way — Alma will be in touch soon.");
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
