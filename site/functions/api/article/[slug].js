import { BODIES } from "../../_data/bodies.js";
import { currentMember, freeQuota, readMeter, writeMeter, json, METER_COOKIE } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const slug = context.params.slug;
  const html = BODIES[slug];
  if (!html) return json({ error: "not found" }, 404);

  // מנויה פעילה: גישה מלאה
  const member = await currentMember(context);
  if (member) return json({ html, via: "subscription" });

  const quota = freeQuota(context.env);
  const meter = await readMeter(context);
  const alreadyRead = meter.slugs.includes(slug);
  const remaining = Math.max(0, quota - meter.slugs.length);
  const wantsToSpend = new URL(context.request.url).searchParams.get("consume") === "1";

  // כתבה שכבר נפתחה החודש נשארת פתוחה ולא נספרת שוב
  if (alreadyRead) return json({ html, via: "meter", freeRemaining: remaining });

  if (wantsToSpend && remaining > 0 && context.env.SESSION_SECRET) {
    meter.slugs.push(slug);
    const cookie = await writeMeter(meter, context.env.SESSION_SECRET);
    return json(
      { html, via: "meter", freeRemaining: Math.max(0, quota - meter.slugs.length) },
      200,
      { "set-cookie": cookie }
    );
  }

  return json({ error: "subscription required", reason: "paywall", freeRemaining: remaining }, 402);
}
