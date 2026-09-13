/**
 * חתימה ואימות של עוגיות חברות ומונה קריאות. HMAC-SHA256 דרך WebCrypto.
 * אין סיסמאות ואין אחסון של פרטי תשלום.
 */
const encoder = new TextEncoder();

export const MEMBER_COOKIE = "mirrors_member";
export const METER_COOKIE = "mirrors_meter";

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(str) {
  const pad = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function mac(data, secret) {
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(data))));
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sign(payload, secret) {
  const data = b64url(encoder.encode(JSON.stringify(payload)));
  return data + "." + (await mac(data, secret));
}

export async function verify(token, secret) {
  const [data, sig] = String(token || "").split(".");
  if (!data || !sig) return null;
  if (!equal(sig, await mac(data, secret))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64url(data)));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readCookies(request) {
  const out = {};
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function cookie(name, value, maxAgeSeconds) {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  return bits.join("; ");
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

export const bad = (message, status = 400) => json({ error: message }, status);

/** מחזיר את רשומת המנויה מ-KV אם העוגייה תקפה והמנוי פעיל. */
export async function currentMember(context) {
  const { request, env } = context;
  if (!env.SESSION_SECRET || !env.MEMBERS) return null;
  const token = readCookies(request)[MEMBER_COOKIE];
  const payload = await verify(token, env.SESSION_SECRET);
  if (!payload || !payload.email) return null;
  const raw = await env.MEMBERS.get("member:" + payload.email);
  if (!raw) return null;
  const member = JSON.parse(raw);
  return ["active", "trialing", "past_due"].includes(member.status) ? member : null;
}

export async function memberCookie(email, secret) {
  const token = await sign({ email, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }, secret);
  return cookie(MEMBER_COOKIE, token, 30 * 24 * 60 * 60);
}

/* -------------------------------------------------- מונה קריאות חינם */
const month = () => new Date().toISOString().slice(0, 7);

export function freeQuota(env) {
  const n = parseInt(env.FREE_ARTICLES_PER_MONTH ?? "2", 10);
  return Number.isFinite(n) ? n : 2;
}

export async function readMeter(context) {
  const payload = await verify(readCookies(context.request)[METER_COOKIE], context.env.SESSION_SECRET);
  if (!payload || payload.m !== month()) return { m: month(), slugs: [] };
  return { m: payload.m, slugs: Array.isArray(payload.slugs) ? payload.slugs : [] };
}

export async function writeMeter(meter, secret) {
  const token = await sign({ m: meter.m, slugs: meter.slugs.slice(-20) }, secret);
  return cookie(METER_COOKIE, token, 40 * 24 * 60 * 60);
}
