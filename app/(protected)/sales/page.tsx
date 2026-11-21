import { DbError } from "@/components/db-error"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { dayRange, monthStart, readRange, toYmd } from "@/lib/format"
import { finishedInRange } from "@/lib/sales"
import type { Order, OrderLine } from "@/lib/types"
import { SalesView } from "./sales-view"

export const metadata = { title: "Sales History" }

const LIMIT = 300
const STATUSES = { all: "All", COMPLETED: "Completed", CANCELLED: "Cancelled" } as const

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string }>
}) {
  await requireModule("sales")
  const params = await searchParams
  const supabase = await getSupabase()
  const today = toYmd()
  const { from, to } = readRange(params, { from: monthStart(today), to: today })
  const range = dayRange(from, to)
  const status = (params.status && params.status in STATUSES ? params.status : "all") as keyof typeof STATUSES

  const [{ isAdmin, can }, ordersResult, summaryResult, cancelledResult] = await Promise.all([
    requireUser(),
    supabase.from("orders").select("*").or(finishedInRange(range.from, range.to, status)).order("id", { ascending: false }).limit(LIMIT),
    supabase.rpc("sales_summary", { p_from: range.from.toISOString(), p_to: range.to.toISOString() }),
    supabase.from("orders").select("id", { count: "exact", head: true }).or(finishedInRange(range.from, range.to, "CANCELLED")),
  ])
  if (ordersResult.error) return <DbError error={ordersResult.error} />
  if (summaryResult.error) return <DbError error={summaryResult.error} />

  const orders = ordersResult.data as Order[]
  const summary = summaryResult.data as { count: number; total: number }
  const cancelled = cancelledResult.count ?? 0

  // Each order's items in words, for the list.
  const lines: OrderLine[] = []
  for (let i = 0; i < orders.length; i += 200) {
    const { data } = await supabase
      .from("order_item")
      .select("*, items(name, unit)")
      .in("order_id", orders.slice(i, i + 200).map(o => o.id))
    lines.push(...((data ?? []) as OrderLine[]))
  }

  const byMethod = new Map<string, number>()
  for (const o of orders) {
    if (o.status !== "COMPLETED") continue
    const paid = o.paid_now != null ? Number(o.paid_now) : Number(o.total_price)
    if (paid > 0) {
      const key = o.payment_method && o.payment_method !== "Credit" ? o.payment_method : "Not recorded"
      byMethod.set(key, (byMethod.get(key) ?? 0) + paid)
    }
    if (Number(o.on_credit ?? 0) > 0) byMethod.set("On credit", (byMethod.get("On credit") ?? 0) + Number(o.on_credit))
  }
  const itemsByOrder: Record<number, string> = {}
  for (const l of lines) {
    const text = `${l.item_name ?? l.items?.name ?? "?"} ×${l.quantity}`
    itemsByOrder[l.order_id] = itemsByOrder[l.order_id] ? `${itemsByOrder[l.order_id]}, ${text}` : text
  }

  return (
    <SalesView
      data={{
        from,
        to,
        status,
        today,
        isAdmin,
        canVoid: can("cancel_sales"),
        orders,
        itemsByOrder,
        summary,
        cancelled,
        byMethod: [...byMethod].sort((a, b) => b[1] - a[1]),
        truncated: orders.length === LIMIT,
        limit: LIMIT,
      }}
    />
  )
}
