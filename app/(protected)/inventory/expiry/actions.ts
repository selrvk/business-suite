"use server"

import { revalidatePath } from "next/cache"
import { guard } from "@/lib/auth"
import { logActivity } from "@/lib/activity"
import { dbMessage } from "@/lib/db"
import type { ActionResult } from "@/lib/types"

const YMD = /^\d{4}-\d{2}-\d{2}$/

function refresh() {
  revalidatePath("/", "layout")
}

/** Takes a whole batch out of stock (expired, damaged, returned) and logs it. */
export async function removeBatch(id: number, reason: string): Promise<ActionResult> {
  const g = await guard({ permission: "adjust_stock" })
  if (!g.ok) return g
  const { data: batch } = await g.session.supabase.from("stock_batches").select("quantity, lot, expires_on, items(name)").eq("id", id).maybeSingle()
  const { error } = await g.session.supabase.rpc("remove_batch", { p_batch_id: id, p_note: reason.trim().slice(0, 60) || "Removed" })
  if (error) return { ok: false, error: dbMessage(error) }
  const item = batch?.items as unknown as { name: string } | null
  await logActivity(g.session, "batch_removed", item?.name ?? `Batch ${id}`, { quantity: batch?.quantity, lot: batch?.lot, expires: batch?.expires_on, reason })
  refresh()
  return { ok: true, data: null }
}

/** Fixes a batch's expiry date or lot number (a typo at Stock In). */
export async function updateBatch(id: number, input: { expires_on: string; lot: string }): Promise<ActionResult> {
  const g = await guard({ permission: "adjust_stock" })
  if (!g.ok) return g
  if (input.expires_on && !YMD.test(input.expires_on)) return { ok: false, error: "Pick a valid date." }
  if (!input.expires_on && !input.lot.trim()) return { ok: false, error: "Enter an expiry date or lot number." }
  const { error } = await g.session.supabase
    .from("stock_batches")
    .update({ expires_on: input.expires_on || null, lot: input.lot.trim().slice(0, 60) || null })
    .eq("id", id)
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}

/** Records the expiry date of stock already on hand that has none yet. Doesn't change the stock. */
export async function recordBatch(input: { item_id: number; quantity: number; expires_on: string; lot: string }): Promise<ActionResult> {
  const g = await guard({ permission: "adjust_stock" })
  if (!g.ok) return g
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) return { ok: false, error: "Enter how many." }
  if (input.expires_on && !YMD.test(input.expires_on)) return { ok: false, error: "Pick a valid date." }
  const { error } = await g.session.supabase.rpc("record_batch", {
    p_item_id: input.item_id,
    p_quantity: input.quantity,
    p_expires_on: input.expires_on || null,
    p_lot: input.lot.trim().slice(0, 60) || null,
  })
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}
