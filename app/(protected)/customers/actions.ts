"use server"

import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/activity"
import { guard } from "@/lib/auth"
import { dbMessage } from "@/lib/db"
import type { ActionResult } from "@/lib/types"

export type CustomerInput = { name: string; phone: string; address: string; notes: string; credit_limit: string }

function refresh() {
  revalidatePath("/customers")
  revalidatePath("/pos")
}

/** Adds or edits a customer. Only people who can sell on credit set credit limits. */
export async function saveCustomer(input: CustomerInput, id?: number): Promise<ActionResult<{ id: number }>> {
  const g = await guard()
  if (!g.ok) return g
  const name = input.name.trim()
  if (!name || name.length > 120) return { ok: false, error: "Enter the customer's name." }
  const fields: Record<string, string | number | null> = {
    name,
    phone: input.phone.trim().slice(0, 60) || null,
    address: input.address.trim().slice(0, 300) || null,
    notes: input.notes.trim().slice(0, 1000) || null,
  }
  if (g.session.can("credit")) {
    const limit = input.credit_limit.trim()
    if (limit && (!Number.isFinite(Number(limit)) || Number(limit) < 0)) return { ok: false, error: "The credit limit must be zero or more." }
    fields.credit_limit = limit ? Number(limit) : null
  }
  const { supabase } = g.session
  const { data, error } = id
    ? await supabase.from("customers").update(fields).eq("id", id).select("id").single()
    : await supabase.from("customers").insert(fields).select("id").single()
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: { id: data.id } }
}

export async function recordPayment(input: {
  customerId: number
  amount: number
  method: string
  reference: string
  note: string
}): Promise<ActionResult<number>> {
  const g = await guard({ permission: "credit" })
  if (!g.ok) return g
  if (!(input.amount > 0)) return { ok: false, error: "Enter how much they paid." }
  const { supabase } = g.session
  const { data, error } = await supabase.rpc("record_payment", {
    p_customer_id: input.customerId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference,
    p_note: input.note,
  })
  if (error) return { ok: false, error: dbMessage(error) }
  const { data: customer } = await supabase.from("customers").select("name").eq("id", input.customerId).single()
  await logActivity(g.session, "payment_received", customer?.name ?? `Customer ${input.customerId}`, {
    amount: input.amount,
    method: input.method,
    balance: Number(data),
  })
  refresh()
  return { ok: true, data: Number(data) }
}

export type LedgerEntry = {
  id: number
  change: number
  kind: "sale" | "payment" | "void" | "adjust"
  method: string | null
  reference: string | null
  note: string | null
  created_at: string
  order_id: number | null
}

/** A customer's credit history, newest first. */
export async function customerHistory(customerId: number): Promise<ActionResult<LedgerEntry[]>> {
  const g = await guard({ allowExpired: true })
  if (!g.ok) return g
  const { data, error } = await g.session.supabase
    .from("customer_ledger")
    .select("id, change, kind, method, reference, note, created_at, order_id")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) return { ok: false, error: dbMessage(error) }
  return { ok: true, data: (data ?? []) as LedgerEntry[] }
}

/** Removes a customer who owes nothing. Owners/admins only. */
export async function deleteCustomer(id: number): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { supabase } = g.session
  const { data: customer } = await supabase.from("customers").select("name, balance").eq("id", id).maybeSingle()
  if (!customer) return { ok: false, error: "That customer no longer exists." }
  if (Number(customer.balance) !== 0) return { ok: false, error: `${customer.name} still has a balance. Settle it first.` }
  const { error } = await supabase.from("customers").delete().eq("id", id)
  if (error) return { ok: false, error: dbMessage(error) }
  await logActivity(g.session, "customer_deleted", customer.name)
  refresh()
  return { ok: true, data: null }
}
