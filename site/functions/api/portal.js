import { stripe } from "../_lib/stripe.js";
import { currentMember } from "../_lib/auth.js";

/** פורטל החיוב של Stripe: עדכון אמצעי תשלום, חשבוניות וביטול. */
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const member = await currentMember(context);
  if (!member || !member.customerId) {
    return Response.redirect(url.origin + "/account/index.html?error=not-a-member", 302);
  }
  try {
    const portal = await stripe(context.env, "/billing_portal/sessions", {
      customer: member.customerId,
      return_url: url.origin + "/account/index.html",
    });
    return Response.redirect(portal.url, 302);
  } catch {
    return Response.redirect(url.origin + "/account/index.html?error=portal-unavailable", 302);
  }
}
