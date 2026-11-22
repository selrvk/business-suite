import Link from "next/link"
import { Printer } from "lucide-react"
import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { dayRange, monthStart, toYmd } from "@/lib/format"
import type { Employee, Trip, Vehicle } from "@/lib/types"
import { AddVehicleButton, FleetBoard } from "./fleet-board"
import { FleetSummary } from "./fleet-summary"

export const metadata = { title: "Vehicles" }

export default async function FleetPage() {
  await requireModule("fleet")
  const supabase = await getSupabase()
  const today = toYmd()
  const month = dayRange(monthStart(today), today)

  const [{ isAdmin }, vehiclesResult, openResult, monthResult, recentResult, driversResult] = await Promise.all([
    requireUser(),
    supabase.from("vehicles").select("*").order("name"),
    supabase.from("trips").select("*").is("ended_at", null),
    supabase
      .from("trips")
      .select("vehicle_id, start_odometer, end_odometer")
      .not("ended_at", "is", null)
      .gte("started_at", month.from.toISOString())
      .lt("started_at", month.to.toISOString()),
    supabase.from("trips").select("*").order("started_at", { ascending: false }).limit(12),
    supabase.from("employees").select("id, name, code, position, phone, active").eq("active", true).order("name"),
  ])
  const error = vehiclesResult.error ?? openResult.error ?? monthResult.error ?? recentResult.error ?? driversResult.error
  if (error) return <DbError error={error} />

  const vehicles = vehiclesResult.data as Vehicle[]
  const monthKm = new Map<number, number>()
  for (const t of monthResult.data ?? []) {
    monthKm.set(t.vehicle_id, (monthKm.get(t.vehicle_id) ?? 0) + ((t.end_odometer ?? t.start_odometer) - t.start_odometer))
  }
  const totalKm = [...monthKm.values()].reduce((a, b) => a + b, 0)
  const openTrips = openResult.data as Trip[]

  const active = vehicles.filter(v => v.active).length

  return (
    <>
      <PageHeader title="Vehicles" subtitle="Scan a vehicle's tag (or tap its card) to start or end a trip and log fuel.">
        {vehicles.length > 0 && (
          <Link href="/print/labels/vehicles" target="_blank" className="btn btn-secondary">
            <Printer size={14} aria-hidden /> Print tags
          </Link>
        )}
        {isAdmin && <AddVehicleButton />}
      </PageHeader>

      {vehicles.length > 0 && <FleetSummary onRoad={openTrips.length} vehicles={active} km={totalKm} trips={(monthResult.data ?? []).length} />}

      <FleetBoard
        vehicles={vehicles}
        openTrips={openTrips}
        recent={recentResult.data as Trip[]}
        drivers={driversResult.data as Employee[]}
        monthKm={Object.fromEntries(monthKm)}
        isAdmin={isAdmin}
      />
    </>
  )
}
