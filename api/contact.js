const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const { name, phone, email, goal, callConsent, vmConsent } = req.body || {};

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Please enter your name." });
    return;
  }

  if (!phone || typeof phone !== "string" || phone.replace(/\D/g, "").length < 7) {
    res.status(400).json({ error: "Please enter a valid phone number." });
    return;
  }

  if (!callConsent) {
    res.status(400).json({ error: "Please confirm we have permission to call you." });
    return;
  }

  const hasEmail = typeof email === "string" && EMAIL_PATTERN.test(email.trim());
  const safeGoal = typeof goal === "string" ? goal.trim() : "";

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL || "Alma Fit & Mind <onboarding@resend.dev>";

  if (!apiKey || !toEmail) {
    res.status(500).json({ error: "The form isn't fully set up yet. Please email directly for now." });
    return;
  }

  const emailPayload = {
    from: fromEmail,
    to: [toEmail],
    subject: `New consultation request from ${name.trim()}`,
    html: `
      <h2>New consultation request</h2>
      <p><strong>Name:</strong> ${escapeHtml(name.trim())}</p>
      <p><strong>Phone:</strong> ${escapeHtml(phone.trim())}</p>
      <p><strong>Email:</strong> ${hasEmail ? escapeHtml(email.trim()) : "(not provided)"}</p>
      <p><strong>Message:</strong></p>
      <p>${safeGoal ? escapeHtml(safeGoal).replace(/\n/g, "<br>") : "(not provided)"}</p>
      <hr>
      <p><strong>Permission to call:</strong> ${callConsent ? "✅ Yes" : "❌ No"}</p>
      <p><strong>Permission to leave voicemail:</strong> ${vmConsent ? "✅ Yes" : "❌ No"}</p>
    `,
  };
  if (hasEmail) emailPayload.reply_to = email.trim();

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend error:", errText);
      res.status(502).json({ error: "Couldn't send your request right now. Please try again shortly." });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({ error: "Something went wrong. Please try again shortly." });
  }
};
