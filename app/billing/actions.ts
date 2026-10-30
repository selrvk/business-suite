"use server"

import { revalidatePath } from "next/cache"
import { guard } from "@/lib/auth"
import { config } from "@/lib/config"
import { dbMessage } from "@/lib/db"
import type { ActionResult } from "@/lib/types"

/** The owner reports a payment (e.g. a GCash reference number) for you to approve. */
export async function submitPayment(input: { period: "month" | "year"; reference: string; note: string }): Promise<ActionResult> {
  const g = await guard({ admin: true, allowExpired: true })
  if (!g.ok) return g
  if (input.period !== "month" && !(input.period === "year" && config.price.yearly)) return { ok: false, error: "Choose a plan." }
  const reference = input.reference.trim()
  if (reference.length < 3 || reference.length > 80) return { ok: false, error: "Enter the payment's reference number." }

  const { supabase } = g.session
  const { data: duplicate } = await supabase.from("payment_requests").select("id").eq("reference", reference).neq("status", "rejected").maybeSingle()
  if (duplicate) return { ok: false, error: "You've already sent this reference number. We'll confirm it soon." }

  const { error } = await supabase.from("payment_requests").insert({
    period: input.period,
    amount: input.period === "year" && config.price.yearly ? config.price.yearly : config.price.monthly,
    reference,
    note: input.note.trim() || null,
  })
  if (error) return { ok: false, error: dbMessage(error) }
  revalidatePath("/billing")
  return { ok: true, data: null }
}
