// The profit report (profit_report() in supabase/schema.sql) and helpers for
// showing it. Used by the Profit Report page and the owner summary email.

import { addDays, formatMonth, formatShortDate, formatWeekday, startOfDay } from "./format"

export type ProductProfit = {
  item_id: number | null
  name: string
  category: string | null
  quantity: number
  revenue: number
  cost: number
  profit: number
}

export type ProfitReport = {
  sales: number
  revenue: number
  cost: number
  discounts: number
  items_sold: number
  /** Sold lines from before costs were saved with each sale; their cost is today's buying price. */
  estimated_lines: number
  by_day: { day: string; revenue: number; cost: number }[]
  by_product: ProductProfit[]
  by_category: { category: string; quantity: number; revenue: number; cost: number }[]
  slow_movers: { id: number; name: string; unit: string; current_stock: number; value: number; last_sold: string | null }[]
}

/** Numbers come back from the database as numbers or strings; make them numbers. */
export function readProfitReport(raw: unknown): ProfitReport {
  const r = raw as ProfitReport
  const n = (v: unknown) => Number(v ?? 0)
  return {
    sales: n(r.sales),
    revenue: n(r.revenue),
    cost: n(r.cost),
    discounts: n(r.discounts),
    items_sold: n(r.items_sold),
    estimated_lines: n(r.estimated_lines),
    by_day: (r.by_day ?? []).map(d => ({ day: d.day, revenue: n(d.revenue), cost: n(d.cost) })),
    by_product: (r.by_product ?? []).map(p => ({ ...p, quantity: n(p.quantity), revenue: n(p.revenue), cost: n(p.cost), profit: n(p.profit) })),
    by_category: (r.by_category ?? []).map(c => ({ ...c, quantity: n(c.quantity), revenue: n(c.revenue), cost: n(c.cost) })),
    slow_movers: (r.slow_movers ?? []).map(s => ({ ...s, current_stock: n(s.current_stock), value: n(s.value) })),
  }
}

/** Profit as a share of sales, or null when nothing was sold. */
export function margin(revenue: number, cost: number) {
  return revenue > 0 ? (revenue - cost) / revenue : null
}

export function percent(value: number | null) {
  return value == null ? "—" : `${(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%`
}

export type Bucket = { key: string; label: string; long: string; revenue: number; cost: number }

/**
 * The chart's columns: one per day (every day, including days with no sales),
 * or one per month when the range is longer than about two months.
 */
export function chartBuckets(byDay: ProfitReport["by_day"], from: string, to: string): { buckets: Bucket[]; monthly: boolean } {
  const days: string[] = []
  for (let d = from; d <= to && days.length < 3700; d = addDays(d, 1)) days.push(d)
  const monthly = days.length > 62
  const map = new Map<string, Bucket>()
  for (const day of days) {
    const key = monthly ? day.slice(0, 7) : day
    if (!map.has(key)) {
      const date = startOfDay(monthly ? `${key}-01` : day)
      map.set(key, {
        key,
        label: monthly ? formatMonth(date).slice(0, 3) : days.length <= 7 ? formatWeekday(date).split(",")[0] : formatShortDate(date),
        long: monthly ? formatMonth(date) : formatWeekday(date),
        revenue: 0,
        cost: 0,
      })
    }
  }
  for (const d of byDay) {
    const bucket = map.get(monthly ? d.day.slice(0, 7) : d.day)
    if (!bucket) continue
    bucket.revenue += d.revenue
    bucket.cost += d.cost
  }
  return { buckets: [...map.values()], monthly }
}
