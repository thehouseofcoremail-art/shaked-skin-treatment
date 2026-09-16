import { sign, verify, readCookies, cookie, freeQuota, readMeter, writeMeter, MEMBER_COOKIE, METER_COOKIE }
  from "../functions/_lib/auth.js";
import { verifyWebhook } from "../functions/_lib/stripe.js";

const S = "test-secret-אבג";
let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? "  PASS  " : "  FAIL  ") + name); };

const t = await sign({ email: "romy@studio.co.il", exp: Date.now() + 60000 }, S);
check("round trip", (await verify(t, S))?.email === "romy@studio.co.il");
check("wrong secret rejected", (await verify(t, "other")) === null);
check("tampered payload rejected", (await verify("eyJhIjoxfQ." + t.split(".")[1], S)) === null);
check("garbage rejected", (await verify("nonsense", S)) === null);
check("empty rejected", (await verify("", S)) === null);
check("expired rejected", (await verify(await sign({ email: "x", exp: Date.now() - 1 }, S), S)) === null);
check("unicode survives", (await verify(await sign({ n: "מאחורי המראות" }, S), S))?.n === "מאחורי המראות");

const req = (h) => new Request("https://x.test/", { headers: h });
const c = readCookies(req({ cookie: `${MEMBER_COOKIE}=abc; other=1` }));
check("cookie parse", c[MEMBER_COOKIE] === "abc" && c.other === "1");
check("cookie flags", /HttpOnly/.test(cookie("a", "b", 60)) && /Secure/.test(cookie("a", "b", 60)) && /SameSite=Lax/.test(cookie("a", "b", 60)));

check("quota default", freeQuota({}) === 2);
check("quota from env", freeQuota({ FREE_ARTICLES_PER_MONTH: "5" }) === 5);
check("quota hard wall", freeQuota({ FREE_ARTICLES_PER_MONTH: "0" }) === 0);

const ctx = (cookieStr) => ({ request: req({ cookie: cookieStr }), env: { SESSION_SECRET: S } });
let meter = await readMeter(ctx(""));
check("fresh meter empty", meter.slugs.length === 0);
meter.slugs.push("netisha");
const setCookie = await writeMeter(meter, S);
const token = decodeURIComponent(/margin_meter=([^;]+)/.exec(setCookie)[1]);
const back = await readMeter(ctx(`${METER_COOKIE}=${token}`));
check("meter persists", back.slugs.includes("netisha"));
const forged = await sign({ m: back.m, slugs: [] }, "attacker-secret");
check("forged meter ignored", (await readMeter(ctx(`${METER_COOKIE}=${forged}`))).slugs.length === 0);

const body = JSON.stringify({ id: "evt_1", type: "customer.subscription.deleted" });
const ts = Math.floor(Date.now() / 1000);
const k = await crypto.subtle.importKey("raw", new TextEncoder().encode("whsec_x"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const sig = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(ts + "." + body)))).map(b => b.toString(16).padStart(2, "0")).join("");
check("webhook valid sig", (await verifyWebhook(body, `t=${ts},v1=${sig}`, "whsec_x"))?.type === "customer.subscription.deleted");
check("webhook bad sig", (await verifyWebhook(body, `t=${ts},v1=deadbeef`, "whsec_x")) === null);
check("webhook wrong secret", (await verifyWebhook(body, `t=${ts},v1=${sig}`, "whsec_other")) === null);
check("webhook replay blocked", (await verifyWebhook(body, `t=${ts - 4000},v1=${sig}`, "whsec_x")) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
