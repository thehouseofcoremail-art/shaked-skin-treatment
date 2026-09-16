/** עטיפה מינימלית ל-Stripe REST. ללא SDK. */
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) => flatten({ [i]: item }, key, out));
    else out[key] = String(v);
  }
  return out;
}

export async function stripe(env, path, params, method = "POST") {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");
  const res = await fetch("https://api.stripe.com/v1" + path, {
    method,
    headers: {
      Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params ? new URLSearchParams(flatten(params)) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Stripe request failed");
  return data;
}

/** אימות חתימת Webhook לפי הסכמה של Stripe: v1 = HMAC-SHA256 של "timestamp.payload". */
export async function verifyWebhook(payload, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries(
    String(header || "").split(",").map((p) => p.split("=").map((s) => s.trim()))
  );
  if (!parts.t || !parts.v1) return null;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  if (!Number.isFinite(age) || age > toleranceSeconds) return null;

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(parts.t + "." + payload))
  );
  const hex = Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");

  let diff = hex.length ^ parts.v1.length;
  for (let i = 0; i < Math.min(hex.length, parts.v1.length); i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  if (diff !== 0) return null;

  try { return JSON.parse(payload); } catch { return null; }
}
