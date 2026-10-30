"use server"

import { revalidatePath } from "next/cache"
import { guard } from "@/lib/auth"
import { dbMessage } from "@/lib/db"
import type { ActionResult } from "@/lib/types"

export type EmployeeInput = { name: string; code: string; position: string; phone: string }

export async function saveEmployee(id: number | null, input: EmployeeInput): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const row = {
    name: input.name.trim(),
    code: input.code.trim(),
    position: input.position.trim() || null,
    phone: input.phone.trim() || null,
  }
  if (!row.name) return { ok: false, error: "Enter the employee's name." }
  if (!row.code) return { ok: false, error: "Enter or generate a badge code." }

  const { supabase } = g.session
  const { error } = id ? await supabase.from("employees").update(row).eq("id", id) : await supabase.from("employees").insert(row)
  if (error) return { ok: false, error: dbMessage(error) }
  revalidatePath("/", "layout")
  return { ok: true, data: null }
}

export async function setEmployeeActive(id: number, active: boolean): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { error } = await g.session.supabase.from("employees").update({ active }).eq("id", id)
  if (error) return { ok: false, error: dbMessage(error) }
  revalidatePath("/", "layout")
  return { ok: true, data: null }
}

export async function deleteEmployee(id: number): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { error } = await g.session.supabase.from("employees").delete().eq("id", id)
  if (error) return { ok: false, error: dbMessage(error) }
  revalidatePath("/", "layout")
  return { ok: true, data: null }
}
