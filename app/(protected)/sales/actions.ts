"use server"

import { revalidatePath } from "next/cache"
import { guard } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { dbMessage, fetchAll } from "@/lib/db"
import { dayRange, formatDateTime } from "@/lib/format"
import type { LineDiscount, SaleDiscount } from "@/lib/sale-math"
import { finishedInRange } from "@/lib/sales"
import type { ActionResult, Order, OrderLine } from "@/lib/types"
import type { ExportRow } from "@/components/export-button"

function refresh() {
  revalidatePath("/", "layout")
}

export async function createSale(input: {
  lines: { item_id: number; quantity: number; discount?: LineDiscount }[]
  customerName: string
  complete: boolean
  paymentMethod: string | null
  amountTendered: number | null
  paymentRef?: string
  discount?: SaleDiscount
  /** A saved customer. With paidNow, what isn't paid goes on their balance. */
  customerId?: number | null
  paidNow?: number | null
}): Promise<ActionResult<{ id: number; number: number; total: number; onCredit: number }>> {
  const g = await guard()
  if (!g.ok) return g
  if (!input.lines.length) return { ok: false, error: "Add at least one product." }

  const discount = input.discount
  const { supabase } = g.session
  const { data, error } = await supabase.rpc("create_sale", {
    p_items: input.lines.map(l => ({
      item_id: l.item_id,
      quantity: l.quantity,
      ...(l.discount && l.discount.value > 0 ? { discount_type: l.discount.type, discount_value: l.discount.value } : {}),
    })),
    p_customer_name: input.customerName,
    p_complete: input.complete,
    p_payment_method: input.paymentMethod,
    p_amount_tendered: input.complete ? input.amountTendered : null,
    p_discount: !discount
      ? null
      : "value" in discount
        ? { kind: discount.kind, value: discount.value }
        : { kind: discount.kind, person: discount.person, id_no: discount.idNo },
    p_customer_id: input.customerId ?? null,
    p_paid_now: input.customerId && input.paidNow != null ? input.paidNow : null,
    p_payment_ref: input.paymentRef ?? null,
  })
  if (error) return { ok: false, error: dbMessage(error) }

  // No server re-render here: the POS shows the result at once and refreshes
  // its product list in the background. Other pages load fresh data anyway.
  const sale = data as { id: number; number: number; total: number; on_credit: number }
  const onCredit = Number(sale.on_credit ?? 0)
  if (discount || input.lines.some(l => l.discount && l.discount.value > 0) || onCredit > 0) {
    const { data: saved } = await supabase.from("orders").select("discount_total, discount_kind, discount_person, customer_name").eq("id", sale.id).single()
    if (saved && Number(saved.discount_total) > 0) {
      await logActivity(g.session, "sale_discount", `Sale #${sale.number}`, {
        amount: Number(saved.discount_total),
        kind: saved.discount_kind,
        person: saved.discount_person,
      })
    }
    if (onCredit > 0) await logActivity(g.session, "sale_credit", `Sale #${sale.number}`, { amount: onCredit, customer: saved?.customer_name })
  }
  return { ok: true, data: { id: Number(sale.id), number: sale.number, total: Number(sale.total), onCredit } }
}

/** Voids a completed sale: stock goes back, credit comes off the customer's balance. */
export async function voidSale(orderId: number, reason: string): Promise<ActionResult> {
  const g = await guard({ permission: "cancel_sales" })
  if (!g.ok) return g
  const { supabase } = g.session
  const { error } = await supabase.rpc("void_sale", { p_order_id: orderId, p_reason: reason })
  if (error) return { ok: false, error: dbMessage(error) }
  const { data: order } = await supabase.from("orders").select("number, total_price").eq("id", orderId).single()
  await logActivity(g.session, "sale_voided", `Sale #${order?.number ?? orderId}`, { total: Number(order?.total_price ?? 0), reason })
  refresh()
  return { ok: true, data: null }
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
  const g = await guard({ permission: "cancel_sales" })
  if (!g.ok) return g
  const { data, error } = await g.session.supabase
    .from("orders")
    .update({ status: "CANCELLED", date_cancelled: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "PENDING")
    .select("id, number, total_price")
  if (error) return { ok: false, error: dbMessage(error) }
  if (!data?.length) return { ok: false, error: "That order is no longer pending." }
  await logActivity(g.session, "order_cancelled", `Order #${data[0].number}`, { total: Number(data[0].total_price) })
  refresh()
  return { ok: true, data: null }
}

export async function deleteOrder(orderId: number): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { data, error } = await g.session.supabase.from("orders").delete().eq("id", orderId).select("number, total_price")
  if (error) return { ok: false, error: dbMessage(error) }
  if (data?.length) await logActivity(g.session, "sale_deleted", `Sale #${data[0].number}`, { total: Number(data[0].total_price) })
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
  await logActivity(g.session, "history_deleted", `${fromYmd} to ${toYmd}`, { records: data?.length ?? 0 })
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
      Reference: order.payment_ref ?? "",
    }
    const totals = {
      Subtotal: Number(order.subtotal ?? order.total_price),
      Discount: Number(order.discount_total ?? 0),
      "VAT exempt": Number(order.vat_exempt ?? 0),
      "Senior/PWD": order.discount_kind === "senior" || order.discount_kind === "pwd" ? `${order.discount_kind === "senior" ? "SC" : "PWD"} ${order.discount_person ?? ""} (${order.discount_id_no ?? ""})` : "",
      "Order total": order.total_price,
      "On credit": Number(order.on_credit ?? 0),
      "Void reason": order.void_reason ?? "",
    }
    const blank = Object.fromEntries(Object.keys(totals).map(k => [k, ""]))
    const own = lines.filter(l => l.order_id === order.id)
    if (!own.length) rows.push({ ...base, Item: "", Qty: "", Price: "", "Line discount": "", "Line total": "", ...totals })
    own.forEach((l, i) =>
      rows.push({
        ...base,
        Item: l.item_name ?? l.items?.name ?? "(deleted product)",
        Qty: l.quantity,
        Price: l.price_at_time,
        "Line discount": Number(l.discount ?? 0),
        "Line total": +(l.quantity * l.price_at_time - Number(l.discount ?? 0)).toFixed(2),
        ...(i === 0 ? totals : blank),
      }),
    )
  }
  return { ok: true, data: rows }
}
