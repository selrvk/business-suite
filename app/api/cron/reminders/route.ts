import { access } from "@/lib/auth"
import { collectDigest, digestDue } from "@/lib/digest"
import { emailEnabled } from "@/lib/email"
import { toYmd } from "@/lib/format"
import { sendAccessReminder, sendDigest } from "@/lib/notify"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { Business } from "@/lib/types"

export const maxDuration = 300

/**
 * Runs once a day at 9 AM Philippine time (see vercel.json). It emails each
 * business's owners:
 * - 3 days before their free trial or paid time ends, and on the day it ends;
 * - their summary: yesterday's (daily) or last week's (Mondays), unless off.
 * Each email is sent once (email_log), so re-runs never repeat it.
 * Vercel calls this with "Authorization: Bearer <CRON_SECRET>"; nobody else can.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Not allowed", { status: 401 })
  }
  if (!emailEnabled()) return Response.json({ sent: [], note: "Email isn't set up." })

  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.from("businesses").select("*")
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const businesses = (data ?? []) as Business[]

  const now = Date.now()
  const today = toYmd(now)
  const sent: string[] = []
  const failed: string[] = []

  /** Claims the email first, so two runs at once can't both send it; un-claims it if sending fails. */
  async function once(business: Business, key: string, send: () => Promise<boolean | "skip">) {
    const { error: claimed } = await admin.from("email_log").insert({ business_id: business.id, kind: key })
    if (claimed) return // already sent
    let result: boolean | "skip" = false
    try {
      result = await send()
    } catch (e) {
      failed.push(`${business.name}: ${key}: ${e instanceof Error ? e.message : e}`)
    }
    if (result === true) sent.push(`${business.name}: ${key}`)
    // "skip": nothing to send, and keep the claim so later runs today don't retry it.
    else if (result === false) await admin.from("email_log").delete().eq("business_id", business.id).eq("kind", key)
  }

  for (const business of businesses) {
    const { endsAt, active } = access(business, now)
    const daysLeft = (endsAt.getTime() - now) / 86_400_000
    const kind = daysLeft > 2 && daysLeft <= 3 ? "ends-soon" : daysLeft <= 0 && daysLeft > -1 ? "ended" : null
    if (kind) {
      const onTrial = !business.paid_until || new Date(business.paid_until).getTime() <= new Date(business.trial_ends_at).getTime()
      await once(business, `${kind}:${toYmd(endsAt)}`, () => sendAccessReminder(business, { kind, onTrial, endsAt }))
    }

    const due = active ? digestDue(business.digest, today) : null
    if (due) {
      await once(business, due.key, async () => {
        const digest = await collectDigest(admin, business, due)
        return digest ? sendDigest(business, digest) : "skip"
      })
    }
  }
  return Response.json({ sent, ...(failed.length ? { failed } : {}) })
}
