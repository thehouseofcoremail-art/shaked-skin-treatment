import { sendMail } from "../_lib/mail.js";
import { json, bad } from "../_lib/auth.js";

const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/** כניסה ללא סיסמה: קישור חד-פעמי בתוקף 15 דקות. */
export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch { /* גוף ריק */ }

  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL.test(email)) return bad("כתובת מייל לא תקינה");
  if (!env.MEMBERS) return bad("השרת עוד לא מוגדר. ראו site/README.md", 503);

  const generic = { message: "אם יש מנוי עם הכתובת הזו, נשלח אליה קישור כניסה." };

  const raw = await env.MEMBERS.get("member:" + email);
  // מחזירים תשובה זהה גם כשאין מנוי, כדי לא לחשוף מי רשום
  if (!raw) return json(generic);

  const nonce = crypto.randomUUID().replace(/-/g, "");
  await env.MEMBERS.put("magic:" + nonce, email, { expirationTtl: 900 });

  const link = new URL(request.url).origin + "/api/magic?t=" + nonce;
  const sent = await sendMail(env, {
    to: email,
    subject: "קישור הכניסה שלך",
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7">
      <p>הקישור תקף ל-15 דקות ולשימוש אחד:</p>
      <p><a href="${link}">כניסה לחשבון</a></p>
      <p style="color:#666;font-size:13px">אם לא ביקשת קישור, אפשר להתעלם מהמייל.</p>
    </div>`,
  });

  if (!sent.ok && sent.reason === "mail-not-configured") {
    return bad("שליחת המייל לא מוגדרת עדיין. ראו site/README.md בסעיף Resend.", 503);
  }
  return json(generic);
}
