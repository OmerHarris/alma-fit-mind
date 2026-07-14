const { generateGuidePdf } = require("./_lib/guide-pdf");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  res.status(200).json({ ok: true });
};
