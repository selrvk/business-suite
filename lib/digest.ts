import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { config } from "./config"
import { EXPIRY_SOON_DAYS } from "./expiry"
import { businessModules, hasOption } from "./features"
import { addDays, dayRange } from "./format"
import { readProfitReport, type ProfitReport } from "./reports"
import type { Business } from "./types"

// The owner summary email: last week (sent Mondays) or yesterday (sent every
// morning), plus what needs attention now. Built with the service-role client
// from the daily cron, so every query here filters by business_id itself.

export type DigestKind = "daily" | "weekly"

export type Digest = {
  kind: DigestKind
  from: string
  to: string
  /** Null when the business doesn't use Sales. */
  report: ProfitReport | null
  previousRevenue: number | null
  voids: { count: number; total: number }
  drawer: { days: number; difference: number } | null
  lowStock: { count: number; out: number } | null
  expiry: { expired: number; soon: number } | null
  owed: { total: number; customers: number } | null
}

const isMonday = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay() === 1

/** Which summary is due today, if any, for this setting. */
export function digestDue(setting: Business["digest"], today: string): { kind: DigestKind; from: string; to: string; key: string } | null {
  const kind = setting ?? "weekly"
  if (kind === "daily") {
    const day = addDays(today, -1)
    return { kind, from: day, to: day, key: `digest:${day}` }
  }
  if (kind === "weekly" && isMonday(today)) {
    return { kind, from: addDays(today, -7), to: addDays(today, -1), key: `digest-week:${addDays(today, -7)}` }
  }
  return null
}

const iso = (from: string, to: string) => {
  const r = dayRange(from, to)
  return { from: r.from.toISOString(), to: r.to.toISOString() }
}

/** Everything the summary needs, or null when there's nothing worth sending. */
export async function collectDigest(
  admin: SupabaseClient,
  business: Business,
  period: { kind: DigestKind; from: string; to: string },
): Promise<Digest | null> {
  const modules = businessModules(business)
  if (!modules.includes("sales") && !modules.includes("inventory")) return null
  const id = business.id
  const range = iso(period.from, period.to)
  const span = period.kind === "weekly" ? 7 : 1
  const previous = iso(addDays(period.from, -span), addDays(period.to, -span))
  const today = addDays(period.to, 1)

  let report: ProfitReport | null = null
  let previousRevenue: number | null = null
  let voids = { count: 0, total: 0 }
  let drawer: Digest["drawer"] = null
  let owed: Digest["owed"] = null

  if (modules.includes("sales")) {
    const [now, before, voided, closings, customers] = await Promise.all([
      admin.rpc("profit_report", { p_from: range.from, p_to: range.to, p_tz: config.timeZone, p_slow_days: 60, p_business_id: id }),
      admin.rpc("profit_report", { p_from: previous.from, p_to: previous.to, p_tz: config.timeZone, p_slow_days: 60, p_business_id: id }),
      admin
        .from("orders")
        .select("total_price")
        .eq("business_id", id)
        .eq("status", "CANCELLED")
        .not("void_reason", "is", null)
        .gte("date_cancelled", range.from)
        .lt("date_cancelled", range.to),
      admin.from("day_closings").select("difference").eq("business_id", id).gte("day", period.from).lte("day", period.to),
      admin.from("customers").select("balance").eq("business_id", id).gt("balance", 0),
    ])
    if (now.error) throw new Error(`profit_report: ${now.error.message}`)
    report = readProfitReport(now.data)
    previousRevenue = before.data ? readProfitReport(before.data).revenue : null
    const v = voided.data ?? []
    voids = { count: v.length, total: v.reduce((s, o) => s + Number(o.total_price), 0) }
    const c = closings.data ?? []
    drawer = c.length ? { days: c.length, difference: c.reduce((s, d) => s + Number(d.difference ?? 0), 0) } : null
    const owing = customers.data ?? []
    owed = owing.length ? { total: owing.reduce((s, x) => s + Number(x.balance), 0), customers: owing.length } : null
  }

  let lowStock: Digest["lowStock"] = null
  let expiry: Digest["expiry"] = null
  if (modules.includes("inventory")) {
    const items: { current_stock: number; reorder_level: number | null }[] = []
    for (let start = 0; ; start += 1000) {
      const { data } = await admin.from("items").select("current_stock, reorder_level").eq("business_id", id).order("id").range(start, start + 999)
      items.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    const low = items.filter(i => i.current_stock <= (i.reorder_level ?? business.low_stock_threshold))
    lowStock = { count: low.length, out: low.filter(i => i.current_stock <= 0).length }

    if (hasOption(business, "expiry")) {
      const { data } = await admin
        .from("stock_batches")
        .select("expires_on")
        .eq("business_id", id)
        .gt("quantity", 0)
        .lte("expires_on", addDays(today, EXPIRY_SOON_DAYS))
      const dates = (data ?? []).map(b => b.expires_on as string)
      expiry = { expired: dates.filter(d => d < today).length, soon: dates.filter(d => d >= today).length }
    }
  }

  const quiet =
    !report?.sales && !voids.count && !lowStock?.count && !expiry?.expired && !expiry?.soon
  if (quiet) return null

  return { ...period, report, previousRevenue, voids, drawer, lowStock, expiry, owed }
}
