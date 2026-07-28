const { generateGuidePdf } = require("./_lib/guide-pdf");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Follow-up sequence, queued at signup via Resend's scheduled sending.
// Timed around the 7-day guide: encouragement mid-way, then the ask.
const FOLLOW_UPS = [
  {
    days: 2,
    subject: "How are the first two days going?",
    html: `
      <p>Hi, it's Alma 💛</p>
      <p>You're two days into the Mind-Body Reset — that's exactly where most people quietly give up. Don't. Day 1 and 2 are the hardest because nothing feels different yet.</p>
      <p>One tip: don't aim for perfect days. Aim for <strong>done</strong> days. Five minutes counts. Showing up counts.</p>
      <p>If anything in the guide is confusing, just reply to this email — I read every message.</p>
      <p>— Alma</p>
    `,
  },
  {
    days: 5,
    subject: "Day 5 — this is where it starts to click",
    html: `
      <p>Hi, it's Alma 💛</p>
      <p>If you've kept up with the guide, you've probably noticed something small: a bit more energy, a bit less noise in your head. That's not luck — that's what happens when body, plate and mind pull in the same direction.</p>
      <p>I built my whole coaching method on that idea, because it's how I changed my own body and mindset. If you're curious how the full version works, here's the short read:</p>
      <p><a href="https://almafitandmind.com/method.html">The Body–Plate–Mind Method &rarr;</a></p>
      <p>Two more days — finish strong.</p>
      <p>— Alma</p>
    `,
  },
  {
    days: 8,
    subject: "You finished the reset. Ready for a real transformation?",
    html: `
      <p>Hi, it's Alma 💛</p>
      <p>The 7-Day Reset is behind you. Be honest with yourself for a second: how did it feel to have a plan and actually follow it?</p>
      <p>Now imagine that feeling, but with a plan built <em>for you</em> — your body, your schedule, your food — and me personally checking in on you every week.</p>
      <p><strong>So here's my question: are you ready to commit to a 3-month transformation?</strong></p>
      <p>Three months is where real change happens — enough time to build muscle, change habits, and see a difference in the mirror that other people notice too.</p>
      <p style="margin:24px 0;"><a href="https://almafitandmind.com/#pricing" style="background:#b08d3f;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Yes — show me the coaching plans &rarr;</a></p>
      <p>If now isn't the right time, that's okay — keep the guide, keep moving. And if you're on the fence, just reply to this email and tell me your goal. I'll tell you honestly which plan fits (or if none does).</p>
      <p>— Alma</p>
    `,
  },
];

function scheduleFollowUps(apiKey, fromEmail, toVisitor) {
  const jobs = FOLLOW_UPS.map((step) => {
    const sendAt = new Date(Date.now() + step.days * 24 * 60 * 60 * 1000).toISOString();
    return fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toVisitor],
        subject: step.subject,
        html: step.html,
        scheduled_at: sendAt,
      }),
    }).then(async (r) => {
      if (!r.ok) console.error(`Follow-up (day ${step.days}) schedule error:`, await r.text());
    }).catch((err) => {
      console.error(`Follow-up (day ${step.days}) schedule error:`, err);
    });
  });
  return Promise.all(jobs);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const { email } = req.body || {};

  if (!email || typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }

  const cleanEmail = email.trim();
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL || "Alma Fit & Mind <onboarding@resend.dev>";

  if (!apiKey) {
    res.status(200).json({ ok: true });
    return;
  }

  // Notify Alma of the new lead (best-effort — never blocks the response)
  if (toEmail) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [toEmail],
          subject: `New 7-Day Guide signup: ${cleanEmail}`,
          html: `<p>New free-guide lead:</p><p><strong>${cleanEmail}</strong></p>`,
        }),
      });
    } catch (err) {
      console.error("Lead notification error:", err);
    }
  }

  // Email the visitor a PDF copy of the guide (best-effort — never blocks the response)
  try {
    const pdfBytes = await generateGuidePdf();
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [cleanEmail],
        subject: "Your 7-Day Mind-Body Reset Guide",
        html: `
          <p>Hi there,</p>
          <p>Thanks for grabbing the 7-Day Mind-Body Reset — your PDF copy is attached, so you can keep it handy without needing to come back to the site.</p>
          <p>One small Body, Plate, and Mind action each day for a week. No crash diet, no fluff.</p>
          <p>— Alma</p>
        `,
        attachments: [
          {
            filename: "7-Day-Mind-Body-Reset.pdf",
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      console.error("Guide PDF email error:", errText);
    }
  } catch (err) {
    console.error("Guide PDF generation/send error:", err);
  }

  // Queue the follow-up sequence (best-effort — never blocks the response)
  await scheduleFollowUps(apiKey, fromEmail, cleanEmail);

  res.status(200).json({ ok: true });
};
