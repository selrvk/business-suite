import { DbError } from "@/components/db-error"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { dayRange, formatShortDateTime, monthStart, readRange, toYmd } from "@/lib/format"
import type { FuelLog, Trip, Vehicle } from "@/lib/types"
import { LogsView } from "./logs-view"

export const metadata = { title: "Trip & Fuel Logs" }

export default async function FleetLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; vehicle?: string }>
}) {
  await requireModule("fleet")
  const params = await searchParams
  const supabase = await getSupabase()
  const today = toYmd()
  const { from, to } = readRange(params, { from: monthStart(today), to: today })
  const range = dayRange(from, to)
  const vehicleId = Number(params.vehicle) || null

  let tripsQuery = supabase
    .from("trips")
    .select("*")
    .gte("started_at", range.from.toISOString())
    .lt("started_at", range.to.toISOString())
    .order("started_at", { ascending: false })
    .limit(2000)
  let fuelQuery = supabase
    .from("fuel_logs")
    .select("*")
    .gte("filled_at", range.from.toISOString())
    .lt("filled_at", range.to.toISOString())
    .order("filled_at", { ascending: false })
    .limit(2000)
  if (vehicleId) {
    tripsQuery = tripsQuery.eq("vehicle_id", vehicleId)
    fuelQuery = fuelQuery.eq("vehicle_id", vehicleId)
  }

  const [{ isAdmin }, tripsResult, fuelResult, vehiclesResult, employeesResult] = await Promise.all([
    requireUser(),
    tripsQuery,
    fuelQuery,
    supabase.from("vehicles").select("*").order("name"),
    supabase.from("employees").select("id, name"),
  ])
  const error = tripsResult.error ?? fuelResult.error ?? vehiclesResult.error ?? employeesResult.error
  if (error) return <DbError error={error} />

  const trips = tripsResult.data as Trip[]
  const fuel = fuelResult.data as FuelLog[]
  const vehicles = vehiclesResult.data as Vehicle[]
  const vehicleName = new Map(vehicles.map(v => [v.id, v.name]))
  const driverName = new Map((employeesResult.data ?? []).map(e => [e.id, e.name as string]))

  const distance = (t: Trip) => (t.end_odometer == null ? 0 : t.end_odometer - t.start_odometer)
  const perVehicle = vehicles
    .map(v => {
      const vt = trips.filter(t => t.vehicle_id === v.id)
      const vf = fuel.filter(f => f.vehicle_id === v.id)
      const km = vt.reduce((s, t) => s + distance(t), 0)
      const liters = vf.reduce((s, f) => s + Number(f.liters), 0)
      const cost = vf.reduce((s, f) => s + Number(f.cost), 0)
      return { id: v.id, name: v.name, trips: vt.length, km, liters, cost }
    })
    .filter(v => v.trips || v.liters)

  const totals = perVehicle.reduce((s, v) => ({ km: s.km + v.km, liters: s.liters + v.liters, cost: s.cost + v.cost }), { km: 0, liters: 0, cost: 0 })

  const tripRows = trips.map(t => ({
    Started: formatShortDateTime(t.started_at),
    Ended: t.ended_at ? formatShortDateTime(t.ended_at) : "",
    Vehicle: vehicleName.get(t.vehicle_id) ?? "",
    Driver: (t.driver_id && driverName.get(t.driver_id)) || "",
    Purpose: t.purpose ?? "",
    "Start km": t.start_odometer,
    "End km": t.end_odometer ?? "",
    Distance: t.end_odometer == null ? "" : distance(t),
    Notes: t.notes ?? "",
  }))
  const fuelRows = fuel.map(f => ({
    Date: formatShortDateTime(f.filled_at),
    Vehicle: vehicleName.get(f.vehicle_id) ?? "",
    Odometer: f.odometer ?? "",
    Liters: Number(f.liters),
    Cost: Number(f.cost),
    "Price / L": +(Number(f.cost) / Number(f.liters)).toFixed(2),
    Station: f.station ?? "",
  }))

  return (
    <LogsView
      data={{
        from,
        to,
        vehicleId,
        isAdmin,
        vehicles: vehicles.map(v => ({ id: v.id, name: v.name })),
        trips,
        fuel,
        driverNames: Object.fromEntries(driverName),
        perVehicle,
        totals,
        tripRows,
        fuelRows,
      }}
    />
  )
}
