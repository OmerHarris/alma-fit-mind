/**
 * Stripe → Supabase. The only automated way money becomes a client.
 *
 * Configure in the Stripe dashboard as:
 *   https://almafitandmind.com/api/stripe-webhook
 *   events: checkout.session.completed, customer.subscription.updated,
 *           customer.subscription.deleted, invoice.payment_failed
 *
 * Three things this refuses to do, all deliberate:
 *
 * 1. It never trusts an unsigned request. If the signature is absent, wrong,
 *    or unverifiable for ANY reason — including "Vercel already ate the raw
 *    body" — it returns 400 and writes nothing. Failing closed on a payments
 *    endpoint is the only safe direction.
 * 2. It never processes the same event twice. Stripe retries on timeouts and
 *    on any non-2xx, so a duplicate is normal traffic, not an anomaly. Event
 *    ids are claimed in `stripe_events` before any work happens.
 * 3. It never guesses a plan. If it cannot identify which of the three plans
 *    was bought, it records nothing and says so loudly in the log, because a
 *    client on the wrong tier is worse than a client Alma adds by hand.
 */

const Stripe = require("stripe");
const { serviceClient, normaliseEmail, upsertOnboarding } = require("./_lib/supabase");

/**
 * Vercel parses JSON bodies by default, which destroys the exact bytes Stripe
 * signed. This turns that off so the raw buffer survives.
 */
module.exports.config = { api: { bodyParser: false } };

/** The raw request bytes, or null if something already consumed the stream. */
function readRawBody(req) {
  return new Promise((resolve) => {
    // Vercel sets req.body when it parsed for us. If that happened, the
    // stream is spent and the signature can never be checked — say so rather
    // than reconstructing an approximation of what Stripe signed.
    if (req.body !== undefined && req.body !== null && !Buffer.isBuffer(req.body)) {
      resolve(null);
      return;
    }
    if (Buffer.isBuffer(req.body)) {
      resolve(req.body);
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(null));
  });
}

/**
 * Which plan was bought.
 *
 * Three sources, most explicit first:
 *   1. `metadata.plan` on the Payment Link or session — set this in the
 *      Stripe dashboard and nothing else has to be guessed.
 *   2. A price id, mapped through env, for when metadata was not set.
 *   3. The amount. The three plans are $29/$49/$99 and have been since
 *      launch, so this makes the webhook work today with no dashboard
 *      change — but it is the fallback, not the design.
 * Returns null rather than a guess.
 */
const PRICE_ENV = {
  foundations: "STRIPE_PRICE_FOUNDATIONS",
  transformation: "STRIPE_PRICE_TRANSFORMATION",
  elite: "STRIPE_PRICE_ELITE",
};
const AMOUNT_TO_PLAN = { 2900: "foundations", 4900: "transformation", 9900: "elite" };
const PLANS = new Set(["foundations", "transformation", "elite"]);

function planFrom({ metadata, priceId, amountTotal }) {
  const tagged = normaliseEmail(metadata && metadata.plan);
  if (PLANS.has(tagged)) return { plan: tagged, via: "metadata" };

  if (priceId) {
    for (const [plan, envName] of Object.entries(PRICE_ENV)) {
      if (process.env[envName] && process.env[envName] === priceId) {
        return { plan, via: "price-id" };
      }
    }
  }

  const byAmount = AMOUNT_TO_PLAN[amountTotal];
  if (byAmount) return { plan: byAmount, via: "amount" };

  return { plan: null, via: "none" };
}

/** Stripe's period end is unix seconds; Postgres wants an ISO timestamp. */
const toIso = (unixSeconds) =>
  typeof unixSeconds === "number" ? new Date(unixSeconds * 1000).toISOString() : null;

const STATUS = {
  active: "active", trialing: "active",
  past_due: "past_due", unpaid: "past_due", incomplete: "past_due",
  canceled: "canceled", incomplete_expired: "canceled",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!secret || !apiKey) {
    console.error("stripe-webhook: STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY not set");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  const raw = await readRawBody(req);
  if (!raw) {
    // Not a client error to explain in detail — just refuse.
    console.error("stripe-webhook: raw body unavailable, cannot verify signature");
    return res.status(400).json({ error: "Invalid signature" });
  }

  const stripe = new Stripe(apiKey);
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, req.headers["stripe-signature"], secret);
  } catch (err) {
    console.error("stripe-webhook: signature rejected —", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  const db = serviceClient();

  /**
   * Claim the event id BEFORE doing any work. The primary key does the
   * mutual exclusion: a duplicate delivery loses the insert and returns here,
   * so two concurrent retries cannot both write a subscription row.
   */
  const claim = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (claim.error) {
    if (claim.error.code === "23505") {
      return res.status(200).json({ received: true, duplicate: true });
    }
    console.error("stripe-webhook: could not claim event —", claim.error.message);
    return res.status(500).json({ error: "Storage error" });
  }

  try {
    await handle(db, stripe, event);
    return res.status(200).json({ received: true });
  } catch (err) {
    // Release the claim so Stripe's retry can actually retry. Leaving it
    // would make a transient failure permanent and silent.
    await db.from("stripe_events").delete().eq("id", event.id);
    console.error(`stripe-webhook: ${event.type} failed —`, err.message);
    return res.status(500).json({ error: "Processing failed" });
  }
};

async function handle(db, stripe, event) {
  const object = event.data.object;

  if (event.type === "checkout.session.completed") {
    /**
     * The chat-minute packs on /exclusive are one-off payments through the
     * same Stripe account, and they arrive here too. They are not coaching
     * subscriptions and must not create an onboarding row for Alma to act on.
     */
    if (object.mode !== "subscription") {
      console.log(`stripe-webhook: ignoring ${object.mode} checkout ${object.id}`);
      return;
    }

    const email = normaliseEmail(
      object.customer_details?.email || object.customer_email,
    );
    if (!email) {
      // Payment Links must be configured to collect an email; without one
      // there is nothing to match on and the row would be unusable.
      throw new Error(`checkout ${object.id} carried no customer email`);
    }

    // The line item holds the price; the session does not.
    let priceId = null;
    try {
      const items = await stripe.checkout.sessions.listLineItems(object.id, { limit: 1 });
      priceId = items.data[0]?.price?.id ?? null;
    } catch {
      /* Falls through to metadata or amount. */
    }

    const { plan, via } = planFrom({
      metadata: { ...(object.metadata || {}) },
      priceId,
      amountTotal: object.amount_total,
    });
    if (!plan) {
      throw new Error(
        `checkout ${object.id} could not be mapped to a plan ` +
        `(price ${priceId}, amount ${object.amount_total}) — ` +
        "set metadata.plan on the Payment Link",
      );
    }
    if (via !== "metadata") {
      console.warn(`stripe-webhook: plan resolved by ${via}; set metadata.plan on the Payment Link`);
    }

    const sub = await db.from("subscriptions").upsert({
      email,
      stripe_customer_id: typeof object.customer === "string" ? object.customer : null,
      stripe_subscription_id:
        typeof object.subscription === "string" ? object.subscription : null,
      plan,
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_subscription_id" }).select("id").single();
    if (sub.error) throw new Error(`subscriptions upsert: ${sub.error.message}`);

    await upsertOnboarding(db, {
      email,
      fullName: object.customer_details?.name || null,
      subscriptionId: sub.data.id,
    });
    console.log(`stripe-webhook: ${email} bought ${plan}`);
    return;
  }

  // The three lifecycle events all say the same thing in different words:
  // this subscription's status changed. There is nothing to create.
  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "invoice.payment_failed"
  ) {
    const subscriptionId =
      event.type === "invoice.payment_failed"
        ? (typeof object.subscription === "string" ? object.subscription : null)
        : object.id;
    if (!subscriptionId) return;

    const patch = { updated_at: new Date().toISOString() };
    if (event.type === "customer.subscription.deleted") patch.status = "canceled";
    else if (event.type === "invoice.payment_failed") patch.status = "past_due";
    else {
      patch.status = STATUS[object.status] || "past_due";
      patch.current_period_end = toIso(object.current_period_end);
    }

    const { error } = await db
      .from("subscriptions").update(patch).eq("stripe_subscription_id", subscriptionId);
    if (error) throw new Error(`subscriptions update: ${error.message}`);
    console.log(`stripe-webhook: ${subscriptionId} → ${patch.status}`);
    return;
  }

  console.log(`stripe-webhook: ignoring ${event.type}`);
}
