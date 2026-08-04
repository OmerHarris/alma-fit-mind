/**
 * The Stripe webhook, exercised in-process against the real database.
 *
 *   node scripts/check-webhook.mjs
 *
 * Runs the actual handler with real Stripe signatures rather than mocking the
 * verification away — the signature check IS the security boundary, and a
 * test that stubs it proves nothing. Uses a throwaway webhook secret and
 * hand-built events, so it needs no Stripe account and no live traffic.
 *
 * Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from the app's .env.local
 * (../alma-app), because that is where they already live.
 */

import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ENV = join(HERE, "..", "..", "alma-app", ".env.local");

function appEnv(name) {
  for (const line of readFileSync(APP_ENV, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && m[1] === name) return m[2].trim();
  }
  return null;
}

const SECRET = "whsec_test_only_never_a_real_secret";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
// The handler needs a key to construct the SDK. Signature verification is
// local arithmetic, and nothing in these tests calls the Stripe API.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
process.env.SUPABASE_URL = appEnv("NEXT_PUBLIC_SUPABASE_URL");
process.env.SUPABASE_SERVICE_ROLE_KEY = appEnv("SUPABASE_SERVICE_ROLE_KEY");

const { default: handler } = await import("../api/stripe-webhook.js");
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const results = [];
const check = (name, ok, detail = "") =>
  results.push({ name, ok, detail: String(detail).slice(0, 120) });

/** A Stripe-format signature header for this exact body. */
function sign(body, secret = SECRET, when = Math.floor(Date.now() / 1000)) {
  const mac = createHmac("sha256", secret).update(`${when}.${body}`).digest("hex");
  return `t=${when},v1=${mac}`;
}

/** Minimal req/res doubles: the handler only uses these few members. */
/**
 * `signature` omitted  -> sign it properly.
 * `signature: null`    -> send NO header at all.
 * `signature: "..."`   -> send exactly that.
 *
 * The three cases need three distinct values. An earlier version used
 * `undefined` for "no header", which is also what an omitted argument gives —
 * so the unsigned test signed its own request and reported that the handler
 * accepts unsigned webhooks. It does not; the test was lying.
 */
async function post(event, opts = {}) {
  const body = JSON.stringify(event);
  const headers = {};
  if (!("signature" in opts)) headers["stripe-signature"] = sign(body);
  else if (opts.signature !== null) headers["stripe-signature"] = opts.signature;

  const req = {
    method: "POST",
    headers,
    // Buffer body: the handler accepts one directly, which is how Vercel
    // presents an unparsed request.
    body: Buffer.from(body),
    on() {},
  };
  let status = 0;
  let payload = null;
  const res = {
    status(c) { status = c; return this; },
    json(p) { payload = p; return this; },
    setHeader() {},
  };
  await handler(req, res);
  return { status, payload };
}

const stamp = Date.now();
const EMAILS = {
  foundations:    `wh-found-${stamp}@example.com`,
  transformation: `wh-trans-${stamp}@example.com`,
  elite:          `wh-elite-${stamp}@example.com`,
};
const AMOUNT = { foundations: 2900, transformation: 4900, elite: 9900 };

const checkoutEvent = (id, plan, subId) => ({
  id,
  type: "checkout.session.completed",
  data: {
    object: {
      id: `cs_${id}`,
      mode: "subscription",
      amount_total: AMOUNT[plan],
      customer: `cus_${plan}_${stamp}`,
      subscription: subId,
      customer_details: { email: EMAILS[plan], name: `WH ${plan}` },
      metadata: { plan },
    },
  },
});

const cleanup = async () => {
  const emails = Object.values(EMAILS);
  await db.from("client_onboarding").delete().in("email", emails);
  await db.from("subscriptions").delete().in("email", emails);
  await db.from("stripe_events").delete().like("id", `evt_wh_${stamp}%`);
};

try {
  await cleanup();

  // ---- 3. an unsigned webhook is rejected --------------------------------
  // First, because if this ever fails nothing else matters.
  const unsigned = await post(checkoutEvent(`evt_wh_${stamp}_unsigned`, "elite", "sub_x"), {
    signature: null,
  });
  check("an unsigned webhook is rejected", unsigned.status === 400, `status ${unsigned.status}`);

  const forged = await post(checkoutEvent(`evt_wh_${stamp}_forged`, "elite", "sub_y"), {
    signature: sign(JSON.stringify({ tampered: true }), "whsec_wrong_secret"),
  });
  check("a wrongly-signed webhook is rejected", forged.status === 400, `status ${forged.status}`);

  const { count: leaked } = await db
    .from("subscriptions").select("*", { count: "exact", head: true })
    .eq("email", EMAILS.elite);
  check("and neither wrote anything", leaked === 0, `${leaked} rows`);

  // ---- 1. each of the three plans lands correctly -------------------------
  for (const plan of ["foundations", "transformation", "elite"]) {
    const res = await post(checkoutEvent(`evt_wh_${stamp}_${plan}`, plan, `sub_${plan}_${stamp}`));
    check(`${plan} checkout accepted`, res.status === 200, `status ${res.status}`);
  }
  const { data: subs } = await db
    .from("subscriptions").select("email, plan, status")
    .in("email", Object.values(EMAILS)).order("plan");
  check("three subscription rows exist", (subs ?? []).length === 3, `${subs?.length ?? 0}`);
  check("each carries the right plan and is active",
        (subs ?? []).every((s) => s.status === "active" && EMAILS[s.plan] === s.email),
        JSON.stringify(subs));

  // ---- 2. a replayed event changes nothing --------------------------------
  const replay = await post(
    checkoutEvent(`evt_wh_${stamp}_elite`, "elite", `sub_elite_${stamp}`));
  check("a replayed event is acknowledged, not reprocessed",
        replay.status === 200 && replay.payload?.duplicate === true,
        JSON.stringify(replay.payload));
  const { count: after } = await db
    .from("subscriptions").select("*", { count: "exact", head: true })
    .eq("email", EMAILS.elite);
  check("and there is still exactly one row for that customer", after === 1, `${after}`);

  // ---- the onboarding rows Alma will see ----------------------------------
  const { data: onboard } = await db
    .from("client_onboarding").select("email, status").in("email", Object.values(EMAILS));
  check("each payment created an onboarding row", (onboard ?? []).length === 3,
        `${onboard?.length ?? 0}`);
  check("all three are waiting on the questionnaire",
        (onboard ?? []).every((o) => o.status === "paid_no_intake"),
        JSON.stringify(onboard));

  // ---- lifecycle ----------------------------------------------------------
  const lifecycle = async (id, type, object) =>
    post({ id, type, data: { object } });

  await lifecycle(`evt_wh_${stamp}_pastdue`, "invoice.payment_failed",
    { subscription: `sub_elite_${stamp}` });
  let { data: one } = await db.from("subscriptions")
    .select("status").eq("stripe_subscription_id", `sub_elite_${stamp}`).single();
  check("a failed invoice marks them past_due", one?.status === "past_due", one?.status);

  await lifecycle(`evt_wh_${stamp}_canceled`, "customer.subscription.deleted",
    { id: `sub_elite_${stamp}` });
  ({ data: one } = await db.from("subscriptions")
    .select("status").eq("stripe_subscription_id", `sub_elite_${stamp}`).single());
  check("a deleted subscription is canceled", one?.status === "canceled", one?.status);

  // ---- the chat-minute packs must not become clients ----------------------
  const oneOff = await post({
    id: `evt_wh_${stamp}_pack`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_pack", mode: "payment", amount_total: 1500,
        customer_details: { email: `wh-pack-${stamp}@example.com` },
      },
    },
  });
  const { count: packRows } = await db.from("client_onboarding")
    .select("*", { count: "exact", head: true }).eq("email", `wh-pack-${stamp}@example.com`);
  check("a one-off chat-minute purchase is ignored",
        oneOff.status === 200 && packRows === 0, `status ${oneOff.status}, ${packRows} rows`);
} catch (err) {
  check("run completed without throwing", false, err.message);
} finally {
  await cleanup();
}

const failed = results.filter((r) => !r.ok);
for (const r of failed) console.log(`FAIL  ${r.name}  [${r.detail}]`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
