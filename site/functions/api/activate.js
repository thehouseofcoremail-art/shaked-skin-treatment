import { stripe } from "../_lib/stripe.js";
import { memberCookie } from "../_lib/auth.js";

const LABELS = { trial: "חודשי", annual: "שנתי", team: "סטודיו" };

/** חזרה מ-Stripe Checkout: מאמתים מול Stripe, רושמים ב-KV ומנפיקים עוגיית התחברות. */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get("session_id");
  const fail = (why) => Response.redirect(url.origin + "/account/index.html?error=" + encodeURIComponent(why), 302);

  if (!id) return fail("missing-session");
  if (!env.MEMBERS || !env.SESSION_SECRET) return fail("server-not-configured");

  let session;
  try {
    session = await stripe(env, "/checkout/sessions/" + encodeURIComponent(id) + "?expand[]=subscription", null, "GET");
  } catch {
    return fail("verification-failed");
  }

  const email = (session.customer_details?.email || session.customer_email || "").toLowerCase();
  const status = session.subscription?.status || (session.status === "complete" ? "active" : "incomplete");
  if (!email || !["active", "trialing"].includes(status)) return fail("not-active");

  const plan = session.metadata?.plan || session.client_reference_id || "annual";
  const member = {
    email,
    customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
    subscriptionId: session.subscription?.id || null,
    status,
    plan,
    planLabel: LABELS[plan] || plan,
    updated: new Date().toISOString(),
  };

  await env.MEMBERS.put("member:" + email, JSON.stringify(member));
  if (member.customerId) await env.MEMBERS.put("customer:" + member.customerId, email);

  return new Response(null, {
    status: 302,
    headers: {
      Location: url.origin + "/account/index.html",
      "Set-Cookie": await memberCookie(email, env.SESSION_SECRET),
    },
  });
}
