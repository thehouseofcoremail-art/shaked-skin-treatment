import { memberCookie } from "../_lib/auth.js";

/** מימוש קישור הכניסה. חד-פעמי: המפתח נמחק מיד. */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("t") || "";
  const fail = (why) => Response.redirect(url.origin + "/account/index.html?error=" + why, 302);

  if (!token || !env.MEMBERS || !env.SESSION_SECRET) return fail("bad-link");

  const email = await env.MEMBERS.get("magic:" + token);
  if (!email) return fail("expired");
  await env.MEMBERS.delete("magic:" + token);

  const raw = await env.MEMBERS.get("member:" + email);
  if (!raw) return fail("no-subscription");

  return new Response(null, {
    status: 302,
    headers: {
      Location: url.origin + "/account/index.html",
      "Set-Cookie": await memberCookie(email, env.SESSION_SECRET),
    },
  });
}
