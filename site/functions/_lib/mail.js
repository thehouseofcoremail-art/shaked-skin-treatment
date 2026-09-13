/** שליחת מייל דרך Resend. ספק אחר: להחליף את הפונקציה הזו בלבד. */
export async function sendMail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    return { ok: false, reason: "mail-not-configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html }),
  });
  return { ok: res.ok, reason: res.ok ? "" : "provider-error-" + res.status };
}
