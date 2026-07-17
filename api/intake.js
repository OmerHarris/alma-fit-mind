function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Fields shown in the email, in order. key -> label
const FIELD_LABELS = [
  ["name", "Name"],
  ["age", "Age"],
  ["height", "Height"],
  ["weight", "Weight"],
  ["goals", "Goals"],
  ["trainingHistory", "Training experience"],
  ["frequency", "Trains per week"],
  ["injuries", "Injuries / disabilities"],
  ["allergies", "Allergies / intolerances"],
  ["favoriteFood", "Favorite food"],
  ["alcohol", "Alcohol"],
  ["smoke", "Smokes"],
  ["drugs", "Recreational drugs"],
  ["job", "Work"],
  ["activity", "Daily activity level"],
  ["status", "Relationship status"],
  ["contactPlatform", "Preferred contact"],
  ["contactHandle", "Username / number"],
  ["contactConsent", "Consent to be contacted there"],
  ["notes", "Anything else"],
];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const data = req.body || {};

  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    res.status(400).json({ error: "Please tell me your name." });
    return;
  }
  if (!data.contactPlatform || !data.contactHandle) {
    res.status(400).json({ error: "Please tell me how Alma can reach you." });
    return;
  }
  if (!data.contactConsent) {
    res.status(400).json({ error: "Please confirm Alma can contact you there." });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL || "Alma Fit & Mind <onboarding@resend.dev>";

  if (!apiKey || !toEmail) {
    res.status(500).json({ error: "The intake isn't fully set up yet. Please try the contact form instead." });
    return;
  }

  const rows = FIELD_LABELS.map(([key, label]) => {
    let v = data[key];
    if (Array.isArray(v)) v = v.join(", ");
    if (v === true) v = "Yes";
    if (v === false) v = "No";
    if (v === undefined || v === null || v === "") v = "(skipped)";
    return `<tr><td style="padding:6px 12px;font-weight:600;color:#14181a;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 12px;color:#4a4a4a">${escapeHtml(v).replace(/\n/g, "<br>")}</td></tr>`;
  }).join("");

  const html = `
    <h2 style="font-family:Georgia,serif;color:#14181a">New client intake — ${escapeHtml(data.name.trim())}</h2>
    <p style="color:#6b6255">Completed via the Alma's Assistant chat. Preferred contact: <strong>${escapeHtml(data.contactPlatform)}</strong> — <strong>${escapeHtml(data.contactHandle)}</strong></p>
    <table style="border-collapse:collapse;width:100%;max-width:640px;font-family:Arial,sans-serif;font-size:14px;border:1px solid #eee">
      ${rows}
    </table>
  `;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: `New client intake from ${data.name.trim()} — via ${data.contactPlatform}`,
        html,
      }),
    });
    if (!resendRes.ok) {
      console.error("Intake Resend error:", await resendRes.text());
      res.status(502).json({ error: "Couldn't send your info right now. Please try again shortly." });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Intake error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again shortly." });
  }
};
