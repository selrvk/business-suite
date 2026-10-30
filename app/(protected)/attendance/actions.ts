"use server"

import { revalidatePath } from "next/cache"
import { guard } from "@/lib/auth"
import { dbMessage } from "@/lib/db"
import { fromDateTimeLocal } from "@/lib/format"
import type { ActionResult, ClockResult } from "@/lib/types"

/** Badge scan at the time clock: clocks in, or out if already in. */
export async function clockByCode(code: string): Promise<ActionResult<ClockResult>> {
  const g = await guard()
  if (!g.ok) return g
  const { data, error } = await g.session.supabase.rpc("clock_by_code", { p_code: code })
  if (error) return { ok: false, error: dbMessage(error) }
  revalidatePath("/attendance")
  return { ok: true, data: data as ClockResult }
}

/** Manual clock in/out from the attendance board (forgot their badge). */
export async function clockEmployee(employeeId: number): Promise<ActionResult<ClockResult>> {
  const g = await guard()
  if (!g.ok) return g
  const { data, error } = await g.session.supabase.rpc("clock_employee", { p_employee_id: employeeId, p_guard: false })
  if (error) return { ok: false, error: dbMessage(error) }
  revalidatePath("/attendance")
  return { ok: true, data: data as ClockResult }
}

/** Admin fix-ups: add a missed day or correct times. Times are datetime-local strings in business time. */
export async function saveAttendance(
  id: number | null,
  input: { employee_id: number; clock_in: string; clock_out: string; note: string },
): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const clockIn = fromDateTimeLocal(input.clock_in)
  const clockOut = input.clock_out ? fromDateTimeLocal(input.clock_out) : null
  if (!clockIn) return { ok: false, error: "Enter the clock-in time." }
  if (input.clock_out && !clockOut) return { ok: false, error: "The clock-out time isn't valid." }
  if (clockOut && clockOut < clockIn) return { ok: false, error: "Clock-out can't be earlier than clock-in." }

  const row = { employee_id: input.employee_id, clock_in: clockIn, clock_out: clockOut, note: input.note.trim() || null }
  const { supabase } = g.session
  const { error } = id ? await supabase.from("attendance").update(row).eq("id", id) : await supabase.from("attendance").insert(row)
  if (error) return { ok: false, error: dbMessage(error) }
  revalidatePath("/attendance", "layout")
  return { ok: true, data: null }
}

export async function deleteAttendance(id: number): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { error } = await g.session.supabase.from("attendance").delete().eq("id", id)
  if (error) return { ok: false, error: dbMessage(error) }
  revalidatePath("/attendance", "layout")
  return { ok: true, data: null }
}
