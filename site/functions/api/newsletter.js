import { json, bad } from "../_lib/auth.js";

const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch { /* גוף ריק */ }

  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL.test(email)) return bad("כתובת מייל לא תקינה");
  if (!env.MEMBERS) return bad("הרשימה עוד לא מחוברת. ראו site/README.md", 503);

  await env.MEMBERS.put(
    "news:" + email,
    JSON.stringify({ email, joined: new Date().toISOString(), source: request.headers.get("referer") || "" })
  );
  return json({ message: "נרשמת. הגיליון הפתוח הבא יגיע אלייך במייל." });
}
