"use server"

import { revalidatePath } from "next/cache"
import { guard } from "@/lib/auth"
import { dbMessage } from "@/lib/db"
import { fromDateTimeLocal } from "@/lib/format"
import type { ActionResult } from "@/lib/types"

function refresh() {
  revalidatePath("/", "layout")
}

const whole = (value: unknown) => {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : null
}

export async function saveVehicle(
  id: number | null,
  input: { name: string; plate_number: string; code: string; odometer: number; notes: string; active: boolean },
): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const odometer = whole(input.odometer)
  const row = {
    name: input.name.trim(),
    plate_number: input.plate_number.trim().toUpperCase() || null,
    code: input.code.trim(),
    notes: input.notes.trim() || null,
    odometer: odometer ?? 0,
    active: input.active,
  }
  if (!row.name) return { ok: false, error: "Give the vehicle a name, e.g. Truck 1." }
  if (!row.code) return { ok: false, error: "Enter or generate a tag code." }
  if (odometer === null) return { ok: false, error: "Odometer must be a whole number of km." }

  const { supabase } = g.session
  const { error } = id ? await supabase.from("vehicles").update(row).eq("id", id) : await supabase.from("vehicles").insert(row)
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}

export async function deleteVehicle(id: number): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { error } = await g.session.supabase.from("vehicles").delete().eq("id", id)
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}

/**
 * Starts a trip, or logs a finished one in one go when an end reading is given
 * (handy for copying in an old paper logbook).
 */
export async function logTrip(input: {
  vehicle_id: number
  driver_id: number | null
  purpose: string
  start_odometer: number
  end_odometer: number | null
  when: string
}): Promise<ActionResult> {
  const g = await guard()
  if (!g.ok) return g
  const start = whole(input.start_odometer)
  const end = input.end_odometer === null ? null : whole(input.end_odometer)
  if (start === null) return { ok: false, error: "Enter the starting odometer reading." }
  if (input.end_odometer !== null && end === null) return { ok: false, error: "The ending odometer must be a whole number." }
  if (end !== null && end < start) return { ok: false, error: "The ending odometer can't be lower than the starting one." }
  const when = (input.when && fromDateTimeLocal(input.when)) || new Date().toISOString()

  const { error } = await g.session.supabase.from("trips").insert({
    vehicle_id: input.vehicle_id,
    driver_id: input.driver_id,
    purpose: input.purpose.trim() || null,
    start_odometer: start,
    end_odometer: end,
    started_at: when,
    ended_at: end === null ? null : when,
  })
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}

export async function endTrip(tripId: number, endOdometer: number, notes: string): Promise<ActionResult> {
  const g = await guard()
  if (!g.ok) return g
  const end = whole(endOdometer)
  if (end === null) return { ok: false, error: "Enter the odometer reading as a whole number." }
  const { data, error } = await g.session.supabase
    .from("trips")
    .update({ end_odometer: end, ended_at: new Date().toISOString(), notes: notes.trim() || null })
    .eq("id", tripId)
    .is("ended_at", null)
    .select("id")
  if (error) return { ok: false, error: dbMessage(error) }
  if (!data?.length) return { ok: false, error: "That trip was already ended." }
  refresh()
  return { ok: true, data: null }
}

export async function logFuel(input: {
  vehicle_id: number
  odometer: number | null
  liters: number
  cost: number
  station: string
}): Promise<ActionResult> {
  const g = await guard()
  if (!g.ok) return g
  const liters = Number(input.liters)
  const cost = Number(input.cost)
  const odometer = input.odometer === null ? null : whole(input.odometer)
  if (!(liters > 0)) return { ok: false, error: "Enter how many liters." }
  if (!(cost >= 0)) return { ok: false, error: "Enter the amount paid." }
  if (input.odometer !== null && odometer === null) return { ok: false, error: "Odometer must be a whole number." }

  const { error } = await g.session.supabase.from("fuel_logs").insert({
    vehicle_id: input.vehicle_id,
    odometer,
    liters,
    cost,
    station: input.station.trim() || null,
  })
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}

export async function deleteTrip(id: number): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { error } = await g.session.supabase.from("trips").delete().eq("id", id)
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}

export async function deleteFuel(id: number): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { error } = await g.session.supabase.from("fuel_logs").delete().eq("id", id)
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}
