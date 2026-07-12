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

// Contact form (front-end only — no backend wired up yet)
const contactForm = document.getElementById("contactForm");
const formNote = document.getElementById("formNote");

if (contactForm) {
  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    formNote.textContent = "Thanks! This form isn't connected to an inbox yet — for now, please email or call directly.";
  });
}
