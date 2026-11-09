import { verifyWebhook } from "../_lib/stripe.js";

/**
 * מסנכרן סטטוס מנוי מ-Stripe ל-KV.
 * ב-Stripe Dashboard להפנות ל-/api/stripe-webhook ולבחור את האירועים:
 * checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.STRIPE_WEBHOOK_SECRET || !env.MEMBERS) return new Response("not configured", { status: 503 });

  const payload = await request.text();
  const event = await verifyWebhook(payload, request.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!event) return new Response("invalid signature", { status: 400 });

  const object = event.data?.object || {};
  const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;

  let email = (object.customer_details?.email || object.customer_email || "").toLowerCase();
  if (!email && customerId) email = (await env.MEMBERS.get("customer:" + customerId)) || "";
  if (!email) return new Response("ok", { status: 200 });

  const key = "member:" + email;
  const existing = JSON.parse((await env.MEMBERS.get(key)) || "{}");

  switch (event.type) {
    case "checkout.session.completed":
      await env.MEMBERS.put(key, JSON.stringify({
        ...existing, email, customerId, status: "active",
        subscriptionId: typeof object.subscription === "string" ? object.subscription : existing.subscriptionId,
        plan: object.metadata?.plan || existing.plan || "annual",
        updated: new Date().toISOString(),
      }));
      if (customerId) await env.MEMBERS.put("customer:" + customerId, email);
      break;

    case "customer.subscription.updated":
      await env.MEMBERS.put(key, JSON.stringify({
        ...existing, email, customerId, status: object.status,
        subscriptionId: object.id, updated: new Date().toISOString(),
      }));
      break;

    case "customer.subscription.deleted":
      await env.MEMBERS.put(key, JSON.stringify({
        ...existing, email, customerId, status: "canceled", updated: new Date().toISOString(),
      }));
      break;
  }

  return new Response("ok", { status: 200 });
}
