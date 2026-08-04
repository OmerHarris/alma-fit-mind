/**
 * The app's Supabase, from the website's server side only.
 *
 * This uses the SERVICE ROLE key, which bypasses row-level security
 * completely. It must never be imported by anything that ends up in a
 * browser bundle — and on this site nothing can, because /api/*.js are
 * Vercel serverless functions and the rest of the site is static HTML with
 * no build step. There is no path from here to a script tag.
 *
 * The onboarding tables (subscriptions, intake_forms, client_onboarding,
 * stripe_events) have RLS enabled with zero policies, so the service role is
 * the ONLY thing that can read or write them. An anon key gets 42501.
 */

const { createClient } = require("@supabase/supabase-js");

let cached = null;

function serviceClient() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the Vercel " +
      "environment for this project (server-side only, never NEXT_PUBLIC_)",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** The matching rule, in one place, so both writers cannot drift apart. */
function normaliseEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

/**
 * Upsert the join row by email.
 *
 * Deliberately does NOT set `status`: a trigger computes it from whether the
 * subscription and intake ids are present, so payment and intake can arrive
 * in either order, days apart, without either writer knowing about the other.
 *
 * `full_name` is only written when we have one, so a later payment (which
 * carries a name from Stripe) does not blank the name the intake form gave.
 */
async function upsertOnboarding(db, { email, fullName, subscriptionId, intakeFormId }) {
  const row = { email: normaliseEmail(email) };
  if (fullName) row.full_name = fullName;
  if (subscriptionId) row.subscription_id = subscriptionId;
  if (intakeFormId) row.intake_form_id = intakeFormId;

  const { data, error } = await db
    .from("client_onboarding")
    .upsert(row, { onConflict: "email" })
    .select("id, email, status")
    .single();

  if (error) throw new Error(`client_onboarding upsert failed: ${error.message}`);
  return data;
}

module.exports = { serviceClient, normaliseEmail, upsertOnboarding };
