"use server"

import { revalidatePath } from "next/cache"
import { guard } from "@/lib/auth"
import { dbMessage } from "@/lib/db"
import type { ActionResult } from "@/lib/types"

export type SupplierInput = {
  name: string
  contact_person: string
  phone: string
  email: string
  address: string
  notes: string
}

function clean(input: SupplierInput) {
  const name = input.name.trim()
  if (!name) return { error: "Enter the supplier's name." }
  if (name.length > 120) return { error: "That name is too long." }
  const opt = (v: string, max = 200) => v.trim().slice(0, max) || null
  return {
    fields: {
      name,
      contact_person: opt(input.contact_person),
      phone: opt(input.phone, 60),
      email: opt(input.email),
      address: opt(input.address, 300),
      notes: opt(input.notes, 1000),
    },
  }
}

function refresh() {
  revalidatePath("/inventory", "layout")
}

export async function saveSupplier(input: SupplierInput, id?: number): Promise<ActionResult<{ id: number }>> {
  const g = await guard()
  if (!g.ok) return g
  const supplier = clean(input)
  if ("error" in supplier) return { ok: false, error: supplier.error! }
  const { supabase } = g.session
  const { data, error } = id
    ? await supabase.from("suppliers").update(supplier.fields).eq("id", id).select("id").single()
    : await supabase.from("suppliers").insert(supplier.fields).select("id").single()
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: { id: data.id } }
}

/** Adds a supplier by name (from the product form or Stock In). Returns the existing one if the name is taken. */
export async function quickAddSupplier(name: string): Promise<ActionResult<{ id: number; name: string }>> {
  const g = await guard()
  if (!g.ok) return g
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 120) return { ok: false, error: "Enter the supplier's name." }
  const { supabase } = g.session
  const { data, error } = await supabase.from("suppliers").insert({ name: trimmed }).select("id, name").single()
  if (!error) {
    refresh()
    return { ok: true, data }
  }
  const { data: existing } = await supabase.from("suppliers").select("id, name").ilike("name", trimmed.replace(/[\\%_]/g, "\\$&")).maybeSingle()
  return existing ? { ok: true, data: existing } : { ok: false, error: dbMessage(error) }
}

/** Removes a supplier. Its products stay; they just no longer have a supplier. Owners/admins only. */
export async function deleteSupplier(id: number): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { error } = await g.session.supabase.from("suppliers").delete().eq("id", id)
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}
