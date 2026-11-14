import { currentMember, freeQuota, readMeter, json } from "../_lib/auth.js";

export async function onRequestGet(context) {
  const member = await currentMember(context);
  if (member) {
    return json({ member: true, email: member.email, plan: member.planLabel || "מנוי פעיל", status: member.status });
  }
  const meter = await readMeter(context);
  const quota = freeQuota(context.env);
  return json({
    member: false,
    freeRemaining: Math.max(0, quota - meter.slugs.length),
    freeQuota: quota,
  });
}
