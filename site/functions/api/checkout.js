import { stripe } from "../_lib/stripe.js";
import { json, bad } from "../_lib/auth.js";

// מזהי המסלולים חייבים להתאים ל-site.config.json
const PRICE_ENV = { trial: "STRIPE_PRICE_MONTHLY", annual: "STRIPE_PRICE_ANNUAL", team: "STRIPE_PRICE_TEAM" };
const TRIAL_DAYS = { trial: 14 };

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch { /* גוף ריק */ }

  const plan = String(body.plan || "annual");
  const envKey = PRICE_ENV[plan];
  if (!envKey) return bad("מסלול לא מוכר");

  const price = env[envKey];
  if (!price) return bad("הסליקה עוד לא חוברה. ראו site/README.md בסעיף Stripe.", 503);

  const origin = new URL(request.url).origin;
  const trial = TRIAL_DAYS[plan];

  try {
    const session = await stripe(env, "/checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": 1,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      client_reference_id: plan,
      success_url: origin + "/api/activate?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: origin + "/subscribe/index.html",
      ...(trial ? { "subscription_data[trial_period_days]": trial } : {}),
      "metadata[plan]": plan,
    });
    return json({ url: session.url });
  } catch (err) {
    return bad("יצירת התשלום נכשלה: " + err.message, 502);
  }
}
