"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { logActivity } from "@/lib/activity"
import { guard } from "@/lib/auth"
import { dbMessage } from "@/lib/db"
import { dayRange, isYmd } from "@/lib/format"
import { notifyDayClosed } from "@/lib/notify"
import type { ActionResult } from "@/lib/types"

/** Saves the day's closing (closing the same day again replaces it) and emails the owner a copy. */
export async function closeDay(input: { day: string; openingCash: number; countedCash: number; note: string }): Promise<ActionResult<{ expected: number; difference: number }>> {
  const g = await guard()
  if (!g.ok) return g
  if (!isYmd(input.day)) return { ok: false, error: "Pick a day." }
  if (!(input.openingCash >= 0) || !(input.countedCash >= 0)) return { ok: false, error: "Enter the cash amounts." }
  const range = dayRange(input.day)
  const { supabase, business, username } = g.session
  const { data, error } = await supabase.rpc("close_day", {
    p_day: input.day,
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_opening_cash: input.openingCash,
    p_counted_cash: input.countedCash,
    p_note: input.note,
  })
  if (error) return { ok: false, error: dbMessage(error) }
  const result = { expected: Number(data.expected), difference: Number(data.difference) }
  await logActivity(g.session, "day_closed", input.day, { expected: result.expected, counted: input.countedCash, difference: result.difference })
  after(async () => {
    const { data: closing } = await supabase.from("day_closings").select("summary").eq("day", input.day).maybeSingle()
    if (closing) await notifyDayClosed(business, { day: input.day, by: username, summary: closing.summary, expected: result.expected, counted: input.countedCash, difference: result.difference })
  })
  revalidatePath("/sales/close")
  return { ok: true, data: result }
}
