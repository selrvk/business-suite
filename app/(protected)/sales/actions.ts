"use server"

import { revalidatePath } from "next/cache"
import { guard } from "@/lib/auth"
import { dbMessage, fetchAll } from "@/lib/db"
import { dayRange, formatDateTime } from "@/lib/format"
import { finishedInRange } from "@/lib/sales"
import type { ActionResult, Order, OrderLine } from "@/lib/types"
import type { ExportRow } from "@/components/export-button"

function refresh() {
  revalidatePath("/", "layout")
}

export async function createSale(input: {
  lines: { item_id: number; quantity: number }[]
  customerName: string
  complete: boolean
  paymentMethod: string | null
  amountTendered: number | null
}): Promise<ActionResult<{ id: number; number: number; total: number }>> {
  const g = await guard()
  if (!g.ok) return g
  if (!input.lines.length) return { ok: false, error: "Add at least one product." }

  const { supabase } = g.session
  const { data, error } = await supabase.rpc("create_sale", {
    p_items: input.lines,
    p_customer_name: input.customerName,
    p_complete: input.complete,
    p_payment_method: input.complete ? input.paymentMethod : null,
    p_amount_tendered: input.complete ? input.amountTendered : null,
  })
  if (error) return { ok: false, error: dbMessage(error) }

  // No server re-render here: the POS shows the result at once and refreshes
  // its product list in the background. Other pages load fresh data anyway.
  const sale = data as { id: number; number: number; total: number }
  return { ok: true, data: { id: Number(sale.id), number: sale.number, total: Number(sale.total) } }
}

export async function completeOrder(orderId: number): Promise<ActionResult> {
  const g = await guard()
  if (!g.ok) return g
  const { error } = await g.session.supabase.rpc("complete_order", { p_order_id: orderId })
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}

export async function cancelOrder(orderId: number): Promise<ActionResult> {
  const g = await guard()
  if (!g.ok) return g
  const { data, error } = await g.session.supabase
    .from("orders")
    .update({ status: "CANCELLED", date_cancelled: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "PENDING")
    .select("id")
  if (error) return { ok: false, error: dbMessage(error) }
  if (!data?.length) return { ok: false, error: "That order is no longer pending." }
  refresh()
  return { ok: true, data: null }
}

export async function deleteOrder(orderId: number): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { error } = await g.session.supabase.from("orders").delete().eq("id", orderId)
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}

/** Deletes finished (completed/cancelled) records in a date range. Admin only. */
export async function deleteHistory(fromYmd: string, toYmd: string): Promise<ActionResult<number>> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const range = dayRange(fromYmd, toYmd)
  const { data, error } = await g.session.supabase
    .from("orders")
    .delete()
    .or(finishedInRange(range.from, range.to))
    .select("id")
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: data?.length ?? 0 }
}

/** One row per item sold, for Excel. */
export async function exportSales(
  fromYmd: string,
  toYmd: string,
  status: "all" | "COMPLETED" | "CANCELLED" = "all",
): Promise<ActionResult<ExportRow[]>> {
  const g = await guard()
  if (!g.ok) return g
  const { supabase } = g.session
  const range = dayRange(fromYmd, toYmd)

  const { data: orders, error } = await fetchAll<Order>((a, b) =>
    supabase
      .from("orders")
      .select("*")
      .or(finishedInRange(range.from, range.to, status))
      .order("id")
      .range(a, b),
  )
  if (error) return { ok: false, error: dbMessage(error) }

  const lines: OrderLine[] = []
  for (let i = 0; i < orders.length; i += 200) {
    const ids = orders.slice(i, i + 200).map(o => o.id)
    const { data, error: linesError } = await supabase.from("order_item").select("*, items(name, unit)").in("order_id", ids)
    if (linesError) return { ok: false, error: dbMessage(linesError) }
    lines.push(...((data ?? []) as OrderLine[]))
  }

  const rows: ExportRow[] = []
  for (const order of orders) {
    const base = {
      "Order #": order.number,
      Date: formatDateTime(order.date_completed ?? order.date_cancelled ?? order.date_created),
      Status: order.status,
      Customer: order.customer_name ?? "",
      Payment: order.payment_method ?? "",
    }
    const own = lines.filter(l => l.order_id === order.id)
    if (!own.length) rows.push({ ...base, Item: "", Qty: "", Price: "", "Line total": "", "Order total": order.total_price })
    own.forEach((l, i) =>
      rows.push({
        ...base,
        Item: l.item_name ?? l.items?.name ?? "(deleted product)",
        Qty: l.quantity,
        Price: l.price_at_time,
        "Line total": +(l.quantity * l.price_at_time).toFixed(2),
        "Order total": i === 0 ? order.total_price : "",
      }),
    )
  }
  return { ok: true, data: rows }
}
