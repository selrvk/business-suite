import { Trash2 } from "lucide-react"
import { DbError } from "@/components/db-error"
import { DateRange } from "@/components/date-range"
import { ExportButton } from "@/components/export-button"
import { ConfirmButton } from "@/components/modal"
import { Empty, PageHeader, Stat } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { dayRange, formatDuration, formatShortDateTime, money, monthStart, num, readRange, toYmd } from "@/lib/format"
import type { FuelLog, Trip, Vehicle } from "@/lib/types"
import { deleteFuel, deleteTrip } from "../actions"

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
    <>
      <PageHeader eyebrow="Fleet" title="Trip & Fuel Logs">
        <ExportButton rows={tripRows} filename={`trips_${from}_to_${to}`} sheet="Trips" label="Export trips" />
        <ExportButton rows={fuelRows} filename={`fuel_${from}_to_${to}`} sheet="Fuel" label="Export fuel" />
      </PageHeader>

      <div className="flex flex-col gap-3 mb-6">
        <DateRange path="/fleet/logs" from={from} to={to} extra={{ vehicle: vehicleId ? String(vehicleId) : undefined }} />
        <form className="flex items-end gap-2" action="/fleet/logs">
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <label>
            <span className="label">Vehicle</span>
            <select className="input min-w-56" name="vehicle" defaultValue={vehicleId ?? ""}>
              <option value="">All vehicles</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary" type="submit">
            Show
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Stat label="Distance" value={`${num(totals.km)} km`} tone="brand" />
        <Stat label="Fuel" value={`${num(totals.liters, 1)} L`} tone="info" />
        <Stat label="Fuel cost" value={money(totals.cost)} tone="warn" />
        <Stat label="Average" value={totals.liters ? `${num(totals.km / totals.liters, 1)} km/L` : "—"} hint="Distance ÷ fuel bought" />
      </div>

      <section className="flex flex-col gap-3 mb-10">
        <h2 className="section-title">By vehicle</h2>
        <div className="table-wrap">
          {perVehicle.length === 0 ? (
            <Empty title="Nothing logged in this period" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th className="num">Trips</th>
                  <th className="num">Distance</th>
                  <th className="num">Fuel</th>
                  <th className="num">Fuel cost</th>
                  <th className="num">km / L</th>
                  <th className="num">Cost / km</th>
                </tr>
              </thead>
              <tbody>
                {perVehicle.map(v => (
                  <tr key={v.id}>
                    <td className="text-white font-medium">{v.name}</td>
                    <td className="num">{v.trips}</td>
                    <td className="num text-white">{num(v.km)} km</td>
                    <td className="num">{num(v.liters, 1)} L</td>
                    <td className="num">{money(v.cost)}</td>
                    <td className="num">{v.liters ? num(v.km / v.liters, 1) : "—"}</td>
                    <td className="num">{v.km ? money(v.cost / v.km) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3 mb-10">
        <h2 className="section-title">Trips</h2>
        <div className="table-wrap">
          {trips.length === 0 ? (
            <p className="empty">No trips.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Purpose</th>
                  <th className="num">Start → End</th>
                  <th className="num">Distance</th>
                  <th className="num">Time out</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {trips.map(t => (
                  <tr key={t.id}>
                    <td className="muted whitespace-nowrap">{formatShortDateTime(t.started_at)}</td>
                    <td className="text-white">{vehicleName.get(t.vehicle_id)}</td>
                    <td className="muted">{(t.driver_id && driverName.get(t.driver_id)) || "—"}</td>
                    <td className="muted">
                      {t.purpose ?? "—"}
                      {t.notes && <span className="block text-xs faint">{t.notes}</span>}
                    </td>
                    <td className="num muted">
                      {num(t.start_odometer)} → {t.end_odometer != null ? num(t.end_odometer) : "…"}
                    </td>
                    <td className="num text-white">{t.end_odometer != null ? `${num(distance(t))} km` : <span className="pill" data-tone="good">On trip</span>}</td>
                    <td className="num muted">
                      {t.ended_at && t.ended_at !== t.started_at
                        ? formatDuration(new Date(t.ended_at).getTime() - new Date(t.started_at).getTime())
                        : "—"}
                    </td>
                    {isAdmin && (
                      <td className="text-right">
                        <ConfirmButton
                          className="btn btn-ghost btn-icon"
                          title="Delete this trip?"
                          message="The vehicle's odometer stays as it is. Edit the vehicle if it needs correcting."
                          confirmLabel="Delete"
                          action={deleteTrip.bind(null, t.id)}
                        >
                          <Trash2 size={14} />
                        </ConfirmButton>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Fuel</h2>
        <div className="table-wrap">
          {fuel.length === 0 ? (
            <p className="empty">No fuel logged.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vehicle</th>
                  <th className="num">Odometer</th>
                  <th className="num">Liters</th>
                  <th className="num">Paid</th>
                  <th className="num">Per liter</th>
                  <th>Station</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {fuel.map(f => (
                  <tr key={f.id}>
                    <td className="muted whitespace-nowrap">{formatShortDateTime(f.filled_at)}</td>
                    <td className="text-white">{vehicleName.get(f.vehicle_id)}</td>
                    <td className="num muted">{f.odometer != null ? num(f.odometer) : "—"}</td>
                    <td className="num">{num(f.liters, 2)}</td>
                    <td className="num text-white">{money(f.cost)}</td>
                    <td className="num muted">{money(Number(f.cost) / Number(f.liters))}</td>
                    <td className="muted">{f.station ?? "—"}</td>
                    {isAdmin && (
                      <td className="text-right">
                        <ConfirmButton
                          className="btn btn-ghost btn-icon"
                          title="Delete this fuel log?"
                          message="It will no longer count toward fuel totals."
                          confirmLabel="Delete"
                          action={deleteFuel.bind(null, f.id)}
                        >
                          <Trash2 size={14} />
                        </ConfirmButton>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  )
}
