import { Trash2 } from "lucide-react"
import { DateRange } from "@/components/date-range"
import type { ExportRow } from "@/components/export-button"
import { ConfirmButton } from "@/components/modal"
import { Empty, PageHeader } from "@/components/page-header"
import { formatDuration, formatShortDateTime, money, num } from "@/lib/format"
import type { FuelLog, Trip } from "@/lib/types"
import { deleteFuel, deleteTrip } from "../actions"
import { LogsMenu, VehicleFilter } from "./logs-menus"

export type LogsData = {
  from: string
  to: string
  vehicleId: number | null
  isAdmin: boolean
  vehicles: { id: number; name: string }[]
  trips: Trip[]
  fuel: FuelLog[]
  /** Driver names by employee id. */
  driverNames: Record<number, string>
  perVehicle: { id: number; name: string; trips: number; km: number; liters: number; cost: number }[]
  totals: { km: number; liters: number; cost: number }
  tripRows: ExportRow[]
  fuelRows: ExportRow[]
}

/** The Trip & Fuel Logs layout. The page (page.tsx) loads the data. */
export function LogsView({ data }: { data: LogsData }) {
  const { from, to, vehicleId, isAdmin, vehicles, trips, fuel, driverNames, perVehicle, totals, tripRows, fuelRows } = data
  const vehicleName = new Map(vehicles.map(v => [v.id, v.name]))
  const driver = (t: Trip) => (t.driver_id && driverNames[t.driver_id]) || null
  const distance = (t: Trip) => (t.end_odometer == null ? 0 : t.end_odometer - t.start_odometer)
  const timeOut = (t: Trip) =>
    t.ended_at && t.ended_at !== t.started_at ? formatDuration(new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) : null

  const deleteTripButton = (t: Trip) => (
    <ConfirmButton
      className="btn btn-ghost btn-icon"
      title="Delete this trip?"
      message="The vehicle's odometer stays as it is. Edit the vehicle if it needs correcting."
      confirmLabel="Delete"
      action={deleteTrip.bind(null, t.id)}
    >
      <Trash2 size={14} aria-hidden />
      <span className="sr-only">Delete trip</span>
    </ConfirmButton>
  )
  const deleteFuelButton = (f: FuelLog) => (
    <ConfirmButton
      className="btn btn-ghost btn-icon"
      title="Delete this fuel log?"
      message="It will no longer count toward fuel totals."
      confirmLabel="Delete"
      action={deleteFuel.bind(null, f.id)}
    >
      <Trash2 size={14} aria-hidden />
      <span className="sr-only">Delete fuel log</span>
    </ConfirmButton>
  )

  return (
    <>
      <PageHeader title="Trip & Fuel Logs">
        <LogsMenu tripRows={tripRows} fuelRows={fuelRows} from={from} to={to} />
      </PageHeader>

      <div className="flex flex-col gap-3 mb-6 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between">
        <DateRange path="/fleet/logs" from={from} to={to} extra={{ vehicle: vehicleId ? String(vehicleId) : undefined }} />
        <VehicleFilter vehicles={vehicles} vehicleId={vehicleId} from={from} to={to} />
      </div>

      {(trips.length > 0 || fuel.length > 0) && (
        <section className="card summary rise mb-8" data-lead="" aria-labelledby="logs-cost">
          <div className="grid gap-x-10 lg:grid-cols-2 lg:items-start">
            <div className="min-w-0">
              <h2 id="logs-cost" className="stat-label">
                Fuel cost
              </h2>
              <p className="summary-value">{money(totals.cost)}</p>
              <p className="stat-hint">
                {num(fuel.length)} fill-up{fuel.length === 1 ? "" : "s"} · {num(trips.length)} trip{trips.length === 1 ? "" : "s"}
              </p>
            </div>
            <ul className="summary-rows lg:mt-0 lg:border-t-0" aria-label="This period">
              <li>
                <div className="summary-row">
                  <span>Distance</span>
                  <span className="summary-num">{num(totals.km)} km</span>
                </div>
              </li>
              <li>
                <div className="summary-row">
                  <span>Fuel bought</span>
                  <span className="summary-num">{num(totals.liters, 1)} L</span>
                </div>
              </li>
              <li>
                <div className="summary-row">
                  <span>Average (distance ÷ fuel)</span>
                  <span className="summary-num">{totals.liters ? `${num(totals.km / totals.liters, 1)} km/L` : "—"}</span>
                </div>
              </li>
              <li>
                <div className="summary-row">
                  <span>Fuel cost per km</span>
                  <span className="summary-num">{totals.km ? money(totals.cost / totals.km) : "—"}</span>
                </div>
              </li>
            </ul>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3 mb-10">
        <h2 className="section-title">By vehicle</h2>
        {perVehicle.length === 0 ? (
          <div className="table-wrap">
            <Empty title="Nothing logged in this period" />
          </div>
        ) : (
          <>
            <div className="table-wrap hidden lg:block">
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
            </div>
            <div className="lg:hidden card divide-y divide-white/5">
              {perVehicle.map(v => (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{v.name}</p>
                    <p className="text-xs faint">
                      {v.trips} trip{v.trips === 1 ? "" : "s"} · {num(v.liters, 1)} L{v.liters ? ` · ${num(v.km / v.liters, 1)} km/L` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white tabular">{num(v.km)} km</p>
                    <p className="text-xs muted tabular">{money(v.cost)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 mb-10">
        <h2 className="section-title">Trips</h2>
        {trips.length === 0 ? (
          <div className="table-wrap">
            <p className="empty">No trips.</p>
          </div>
        ) : (
          <>
            <div className="table-wrap hidden lg:block">
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
                    {isAdmin && (
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {trips.map(t => (
                    <tr key={t.id}>
                      <td className="muted whitespace-nowrap">{formatShortDateTime(t.started_at)}</td>
                      <td className="text-white">{vehicleName.get(t.vehicle_id)}</td>
                      <td className="muted">{driver(t) ?? "—"}</td>
                      <td className="muted">
                        {t.purpose ?? "—"}
                        {t.notes && <span className="block text-xs faint">{t.notes}</span>}
                      </td>
                      <td className="num muted">
                        {num(t.start_odometer)} → {t.end_odometer != null ? num(t.end_odometer) : "…"}
                      </td>
                      <td className="num text-white">
                        {t.end_odometer != null ? (
                          `${num(distance(t))} km`
                        ) : (
                          <span className="pill" data-tone="good">
                            On trip
                          </span>
                        )}
                      </td>
                      <td className="num muted">{timeOut(t) ?? "—"}</td>
                      {isAdmin && <td className="text-right">{deleteTripButton(t)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lg:hidden card divide-y divide-white/5">
              {trips.map(t => (
                <div key={t.id} className="flex items-center gap-3 pl-4 pr-1 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">
                      {vehicleName.get(t.vehicle_id)}
                      {t.purpose && <span className="muted"> · {t.purpose}</span>}
                    </p>
                    <p className="text-xs faint truncate">
                      {formatShortDateTime(t.started_at)}
                      {driver(t) && ` · ${driver(t)}`}
                      {timeOut(t) && ` · ${timeOut(t)} out`}
                    </p>
                  </div>
                  <span className="text-sm text-white tabular whitespace-nowrap">
                    {t.end_odometer != null ? (
                      `${num(distance(t))} km`
                    ) : (
                      <span className="pill" data-tone="good">
                        On trip
                      </span>
                    )}
                  </span>
                  {isAdmin && deleteTripButton(t)}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Fuel</h2>
        {fuel.length === 0 ? (
          <div className="table-wrap">
            <p className="empty">No fuel logged.</p>
          </div>
        ) : (
          <>
            <div className="table-wrap hidden lg:block">
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
                    {isAdmin && (
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
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
                      {isAdmin && <td className="text-right">{deleteFuelButton(f)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="lg:hidden card divide-y divide-white/5">
              {fuel.map(f => (
                <div key={f.id} className="flex items-center gap-3 pl-4 pr-1 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">
                      {vehicleName.get(f.vehicle_id)}
                      {f.station && <span className="muted"> · {f.station}</span>}
                    </p>
                    <p className="text-xs faint truncate">
                      {formatShortDateTime(f.filled_at)} · {num(f.liters, 2)} L at {money(Number(f.cost) / Number(f.liters))}
                    </p>
                  </div>
                  <span className="text-sm text-white tabular whitespace-nowrap">{money(f.cost)}</span>
                  {isAdmin && deleteFuelButton(f)}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  )
}
