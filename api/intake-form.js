const { generateIntakePdf } = require("./_lib/intake-pdf");

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function slug(s) {
  return String(s).trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 40) || "client";
}

// Fields in questionnaire order. Section headers are rows whose key is null.
const FIELD_LABELS = [
  [null, "ABOUT"],
  ["fullName", "Full name"],
  ["dob", "Date of birth"],
  ["age", "Age"],
  ["email", "Email"],
  ["phone", "Phone / WhatsApp"],
  ["emergencyName", "Emergency contact"],
  ["emergencyPhone", "Emergency phone"],
  [null, "HEALTH & SAFETY"],
  ["h1", "Injuries / joint pain / recent surgeries"],
  ["h1Details", "— details"],
  ["h2", "Diagnosed conditions (BP, diabetes, asthma, heart)"],
  ["h2Details", "— details"],
  ["h3", "Medications affecting HR / BP / balance"],
  ["h3Details", "— details"],
  ["h4", "Dizziness / chest pain on exertion"],
  ["h4Details", "— details"],
  ["h5", "Pregnant or postpartum (12 months)"],
  [null, "GOALS"],
  ["g1", "Primary goal"],
  ["g1Other", "— in their words"],
  ["g2", "Importance right now (1-10)"],
  ["g3", "Target timeline"],
  ["g4", "Success beyond the scale"],
  [null, "EXPERIENCE"],
  ["e1", "Trained with a coach / program before"],
  ["e1Details", "— liked / disliked"],
  ["e2", "Activities they enjoy"],
  ["e3", "Dislikes / wants to avoid"],
  ["e4", "Biggest consistency breaker"],
  [null, "LIFESTYLE"],
  ["l1Job", "Occupation"],
  ["l1Sitting", "Hours sitting / driving per day"],
  ["l2Days", "Training days per week"],
  ["l2Session", "Minutes per session"],
  ["l3Sleep", "Sleep per night"],
  ["l3Rested", "Wakes up rested"],
  ["l4", "Daily stress (1-10)"],
  [null, "NUTRITION"],
  ["n1", "Meals per day"],
  ["n1Skip", "Meals often skipped"],
  ["n2", "Daily water"],
  ["n3", "Allergies / dietary framework"],
  ["n4", "Emotional eating / cravings"],
  [null, "SETUP"],
  ["q1", "Where workouts happen"],
  ["q2", "Home equipment"],
  ["q3", "Wearable"],
  [null, "COACHING & BOUNDARIES"],
  ["p1", "Why now"],
  ["p2", "Preferred coaching style"],
  ["p3", "Check-in channel"],
  ["p4", "Tactile form-correction consent"],
  [null, "ACKNOWLEDGMENT"],
  ["ack", "Certified accurate + agreed to Terms & Waiver"],
  ["signature", "Signed (typed)"],
  ["submittedAt", "Submitted"],
];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const data = req.body || {};

  if (!data.fullName || typeof data.fullName !== "string" || !data.fullName.trim() || data.fullName.trim().length > 120) {
    res.status(400).json({ error: "Please tell us your name." });
    return;
  }
  if (!data.email || !/^\S+@\S+\.\S+$/.test(String(data.email))) {
    res.status(400).json({ error: "Please enter a valid email." });
    return;
  }
  if (!data.phone || !String(data.phone).trim()) {
    res.status(400).json({ error: "Please enter a phone number." });
    return;
  }
  if (!data.emergencyName || !data.emergencyPhone) {
    res.status(400).json({ error: "Please add an emergency contact." });
    return;
  }
  const age = Number(data.age);
  if (!Number.isFinite(age) || age < 18 || age > 120) {
    res.status(400).json({ error: "Coaching is for adults 18 and older." });
    return;
  }
  if (data.ack !== true) {
    res.status(400).json({ error: "Please confirm the acknowledgment." });
    return;
  }
  if (!data.signature || !String(data.signature).trim()) {
    res.status(400).json({ error: "Please type your name as your signature." });
    return;
  }

  // Defense in depth: cap every field length regardless of client-side limits.
  const MAX_FIELD = 900;
  for (const key of Object.keys(data)) {
    if (typeof data[key] === "string") data[key] = data[key].slice(0, MAX_FIELD);
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL || "Alma Fit & Mind <onboarding@resend.dev>";

  if (!apiKey || !toEmail) {
    res.status(500).json({ error: "The intake isn't fully set up yet. Please email Alma directly." });
    return;
  }

  // Normalized [label, value] rows reused for the email table + PDF.
  const plainRows = FIELD_LABELS.map(([key, label]) => {
    if (key === null) return ["— " + label + " —", ""];
    let v = data[key];
    if (v === true) v = "Yes";
    if (v === false) v = "No";
    if (v === undefined || v === null || v === "") v = "(blank)";
    return [label, String(v)];
  });

  const rows = plainRows.map(([label, v]) =>
    `<tr><td style="padding:6px 12px;font-weight:600;color:#14181a;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 12px;color:#4a4a4a">${escapeHtml(v).replace(/\n/g, "<br>")}</td></tr>`
  ).join("");

  const html = `
    <h2 style="font-family:Georgia,serif;color:#14181a">New client questionnaire — ${escapeHtml(data.fullName.trim())}</h2>
    <p style="color:#6b6255">Completed via the onboarding intake page. Reach them at <strong>${escapeHtml(data.email)}</strong> / <strong>${escapeHtml(data.phone)}</strong> — preferred channel: <strong>${escapeHtml(data.p3 || "(not set)")}</strong></p>
    <p style="color:#6b6255">The full questionnaire is attached as a PDF.</p>
    <table style="border-collapse:collapse;width:100%;max-width:680px;font-family:Arial,sans-serif;font-size:14px;border:1px solid #eee">
      ${rows}
    </table>
  `;

  let attachments;
  try {
    const pdfBytes = await generateIntakePdf(data.fullName.trim(), plainRows);
    attachments = [{
      filename: `Client-Questionnaire-${slug(data.fullName)}.pdf`,
      content: Buffer.from(pdfBytes).toString("base64"),
    }];
  } catch (e) {
    console.error("Intake-form PDF error:", e);
  }

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: `New client questionnaire — ${data.fullName.trim()}`,
        html,
        ...(attachments ? { attachments } : {}),
      }),
    });
    if (!resendRes.ok) {
      console.error("Intake-form Resend error:", await resendRes.text());
      res.status(502).json({ error: "Couldn't send your answers right now. Please try again shortly." });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Intake-form error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again shortly." });
  }
};
