import { access } from "@/lib/auth"
import { emailEnabled } from "@/lib/email"
import { toYmd } from "@/lib/format"
import { sendAccessReminder } from "@/lib/notify"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * Runs once a day (see vercel.json). Emails each business's owners 3 days
 * before their free trial or paid time ends, and on the day it ends. Each
 * reminder is sent once per end date (email_log), so re-runs never repeat it.
 * Vercel calls this with "Authorization: Bearer <CRON_SECRET>"; nobody else can.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Not allowed", { status: 401 })
  }
  if (!emailEnabled()) return Response.json({ sent: [], note: "Email isn't set up." })

  const admin = createSupabaseAdminClient()
  const { data: businesses, error } = await admin.from("businesses").select("id, name, trial_ends_at, paid_until")
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const now = Date.now()
  const sent: string[] = []
  for (const business of businesses ?? []) {
    const { endsAt } = access(business, now)
    const daysLeft = (endsAt.getTime() - now) / 86_400_000
    const kind = daysLeft > 2 && daysLeft <= 3 ? "ends-soon" : daysLeft <= 0 && daysLeft > -1 ? "ended" : null
    if (!kind) continue

    // Claim it first, so two runs at once can't both send it.
    const key = `${kind}:${toYmd(endsAt)}`
    const { error: claimed } = await admin.from("email_log").insert({ business_id: business.id, kind: key })
    if (claimed) continue // already sent

    const onTrial = !business.paid_until || new Date(business.paid_until).getTime() <= new Date(business.trial_ends_at).getTime()
    if (await sendAccessReminder(business, { kind, onTrial, endsAt })) sent.push(`${business.name}: ${key}`)
    else await admin.from("email_log").delete().eq("business_id", business.id).eq("kind", key)
  }
  return Response.json({ sent })
}
