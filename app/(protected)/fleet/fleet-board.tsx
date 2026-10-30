"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Flag, Fuel, Pencil, Play, Plus, Printer, RefreshCw, Trash2, Truck } from "lucide-react"
import { generateCode } from "@/components/barcode"
import { ConfirmButton, Modal } from "@/components/modal"
import { Empty } from "@/components/page-header"
import { ScanInput, blockEnter, codeFieldProps } from "@/components/scan-input"
import { useNow } from "@/hooks/use-now"
import { useScanner } from "@/hooks/use-scanner"
import { beep } from "@/lib/beep"
import { currencySymbol, formatDuration, formatShortDateTime, formatTime, num, toDateTimeLocal } from "@/lib/format"
import type { Employee, Trip, Vehicle } from "@/lib/types"
import { deleteVehicle, endTrip, logFuel, logTrip, saveVehicle } from "./actions"

type Panel = { kind: "trip" | "end" | "fuel"; vehicle: Vehicle } | { kind: "vehicle"; vehicle: Vehicle | null }

export function FleetBoard({
  vehicles,
  openTrips,
  recent,
  drivers,
  monthKm,
  isAdmin,
}: {
  vehicles: Vehicle[]
  openTrips: Trip[]
  recent: Trip[]
  drivers: Employee[]
  monthKm: Record<number, number>
  isAdmin: boolean
}) {
  const [panel, setPanel] = useState<Panel | null>(null)
  const [code, setCode] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const now = useNow()

  const openByVehicle = useMemo(() => new Map(openTrips.map(t => [t.vehicle_id, t])), [openTrips])
  const driverName = (id: number | null) => drivers.find(d => d.id === id)?.name ?? null
  const vehicleName = (id: number) => vehicles.find(v => v.id === id)?.name ?? "?"

  function handleCode(raw: string) {
    const value = raw.trim().toLowerCase()
    const vehicle = vehicles.find(v => v.code.toLowerCase() === value || v.plate_number?.toLowerCase() === value)
    setCode("")
    if (!vehicle) {
      beep("error")
      setNotice(`No vehicle has the tag “${raw}”.`)
      return
    }
    beep()
    setNotice(null)
    setPanel({ kind: openByVehicle.has(vehicle.id) ? "end" : "trip", vehicle })
  }

  useScanner(handleCode, { enabled: panel === null })

  const close = () => setPanel(null)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row gap-3">
        <ScanInput value={code} onChange={setCode} onEnter={handleCode} placeholder="Scan a vehicle tag or type its plate number" className="flex-1" autoFocus={false} />
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setPanel({ kind: "vehicle", vehicle: null })}>
            <Plus size={15} /> Add vehicle
          </button>
        )}
      </div>
      {notice && <p className="alert alert-error">{notice}</p>}

      {vehicles.length === 0 ? (
        <div className="card">
          <Empty title="No vehicles yet" icon={<Truck size={30} />}>
            {isAdmin ? "Add your trucks, vans and motorcycles to start logging trips." : "Ask an admin to add vehicles."}
          </Empty>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {vehicles.map(v => {
            const trip = openByVehicle.get(v.id)
            return (
              <article key={v.id} className="card p-5 flex flex-col gap-4" style={{ opacity: v.active ? 1 : 0.5, borderTop: `3px solid ${trip ? "var(--app-success)" : "var(--app-border-strong)"}` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="display text-2xl text-white truncate">{v.name}</p>
                    <p className="text-xs faint">
                      {v.plate_number ?? "No plate"} · <span className="mono">{v.code}</span>
                    </p>
                  </div>
                  {trip ? (
                    <span className="pill" data-tone="good">
                      On trip
                    </span>
                  ) : (
                    <span className="pill">{v.active ? "Available" : "Inactive"}</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="stat-label">Odometer</p>
                    <p className="display text-3xl text-white mt-1">
                      {num(v.odometer)} <span className="text-base faint">km</span>
                    </p>
                  </div>
                  <div>
                    <p className="stat-label">This month</p>
                    <p className="display text-3xl text-white mt-1">
                      {num(monthKm[v.id] ?? 0)} <span className="text-base faint">km</span>
                    </p>
                  </div>
                </div>

                {trip && (
                  <p className="text-xs muted -mt-1" suppressHydrationWarning>
                    {driverName(trip.driver_id) ?? "No driver set"} · {trip.purpose ?? "No destination"} · since {formatTime(trip.started_at)} (
                    {formatDuration(now - new Date(trip.started_at).getTime())})
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-auto">
                  {trip ? (
                    <button className="btn btn-good btn-sm" onClick={() => setPanel({ kind: "end", vehicle: v })}>
                      <Flag size={13} /> End trip
                    </button>
                  ) : (
                    <button className="btn btn-primary btn-sm" onClick={() => setPanel({ kind: "trip", vehicle: v })} disabled={!v.active}>
                      <Play size={13} /> Start trip
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => setPanel({ kind: "fuel", vehicle: v })}>
                    <Fuel size={13} /> Fuel
                  </button>
                  <span className="flex-1" />
                  <Link href={`/print/labels/vehicles?ids=${v.id}`} target="_blank" className="btn btn-ghost btn-icon" title="Print tag">
                    <Printer size={14} />
                  </Link>
                  {isAdmin && (
                    <>
                      <button className="btn btn-ghost btn-icon" onClick={() => setPanel({ kind: "vehicle", vehicle: v })} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <ConfirmButton
                        className="btn btn-ghost btn-icon"
                        title={`Delete ${v.name}?`}
                        message="This also deletes all of its trips and fuel logs. Edit it and untick Active instead to keep history."
                        confirmLabel="Delete everything"
                        action={() => deleteVehicle(v.id)}
                      >
                        <Trash2 size={14} />
                      </ConfirmButton>
                    </>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Recent trips</h2>
            <Link href="/fleet/logs" className="text-xs muted underline decoration-dotted">
              All logs
            </Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Purpose</th>
                  <th className="num">Odometer</th>
                  <th className="num">Distance</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(t => (
                  <tr key={t.id}>
                    <td className="muted whitespace-nowrap">{formatShortDateTime(t.started_at)}</td>
                    <td className="text-white">{vehicleName(t.vehicle_id)}</td>
                    <td className="muted">{driverName(t.driver_id) ?? "—"}</td>
                    <td className="muted">{t.purpose ?? "—"}</td>
                    <td className="num muted">
                      {num(t.start_odometer)} → {t.end_odometer != null ? num(t.end_odometer) : "…"}
                    </td>
                    <td className="num text-white">
                      {t.end_odometer != null ? `${num(t.end_odometer - t.start_odometer)} km` : <span className="pill" data-tone="good">On trip</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Modal
        open={panel !== null}
        onClose={close}
        title={
          panel?.kind === "vehicle"
            ? panel.vehicle
              ? "Edit vehicle"
              : "Add vehicle"
            : panel?.kind === "end"
              ? `End trip · ${panel.vehicle.name}`
              : panel?.kind === "fuel"
                ? `Fuel · ${panel.vehicle.name}`
                : `Start trip · ${panel?.vehicle?.name ?? ""}`
        }
        width={460}
      >
        {panel?.kind === "trip" && <TripForm vehicle={panel.vehicle} drivers={drivers} onClose={close} onFuel={() => setPanel({ kind: "fuel", vehicle: panel.vehicle })} />}
        {panel?.kind === "end" && openByVehicle.get(panel.vehicle.id) && (
          <EndTripForm trip={openByVehicle.get(panel.vehicle.id)!} driver={driverName(openByVehicle.get(panel.vehicle.id)!.driver_id)} onClose={close} />
        )}
        {panel?.kind === "fuel" && <FuelForm vehicle={panel.vehicle} onClose={close} />}
        {panel?.kind === "vehicle" && <VehicleForm key={panel.vehicle?.id ?? "new"} vehicle={panel.vehicle} onClose={close} />}
      </Modal>
    </div>
  )
}

function useSubmit(onClose: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    if (!result.ok) {
      beep("error")
      return setError(result.error)
    }
    beep("ok")
    onClose()
  }
  return { busy, error, run }
}

const optionalInt = (value: FormDataEntryValue | null) => (String(value ?? "").trim() === "" ? null : Number(value))

function TripForm({ vehicle, drivers, onClose, onFuel }: { vehicle: Vehicle; drivers: Employee[]; onClose: () => void; onFuel: () => void }) {
  const { busy, error, run } = useSubmit(onClose)
  const [start, setStart] = useState(String(vehicle.odometer))
  const [now] = useState(() => toDateTimeLocal(new Date()))

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={e => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        run(() =>
          logTrip({
            vehicle_id: vehicle.id,
            driver_id: optionalInt(form.get("driver_id")),
            purpose: String(form.get("purpose")),
            start_odometer: Number(start),
            end_odometer: optionalInt(form.get("end_odometer")),
            when: String(form.get("when")),
          }),
        )
      }}
    >
      {error && <p className="alert alert-error">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Driver</span>
          <select className="input" name="driver_id" defaultValue="">
            <option value="">—</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">When</span>
          <input className="input" type="datetime-local" name="when" defaultValue={now} />
        </label>
      </div>
      <label>
        <span className="label">Destination / purpose</span>
        <input className="input" name="purpose" placeholder="e.g. Delivery to Lipa, pick up supplies" autoFocus />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Odometer at start (km)</span>
          <input className="input tabular" inputMode="numeric" value={start} onChange={e => setStart(e.target.value)} onKeyDown={blockEnter} required />
        </label>
        <label>
          <span className="label">Odometer at end</span>
          <input className="input tabular" inputMode="numeric" name="end_odometer" placeholder="Blank if leaving now" onKeyDown={blockEnter} />
        </label>
      </div>
      {Number(start) < vehicle.odometer && (
        <p className="alert alert-warn">That&apos;s lower than the last reading ({num(vehicle.odometer)} km). Double-check the odometer.</p>
      )}
      <p className="hint -mt-2">Leave the end reading blank to start the trip now and end it when the vehicle is back. Fill both to copy in a finished trip.</p>
      <div className="modal-footer">
        <button type="button" className="btn btn-ghost mr-auto" onClick={onFuel}>
          <Fuel size={14} /> Log fuel instead
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <Play size={14} /> {busy ? "Saving…" : "Save trip"}
        </button>
      </div>
    </form>
  )
}

function EndTripForm({ trip, driver, onClose }: { trip: Trip; driver: string | null; onClose: () => void }) {
  const { busy, error, run } = useSubmit(onClose)
  const [end, setEnd] = useState("")
  const distance = end.trim() === "" ? null : Number(end) - trip.start_odometer

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={e => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        run(() => endTrip(trip.id, Number(end), String(form.get("notes"))))
      }}
    >
      {error && <p className="alert alert-error">{error}</p>}
      <div className="text-sm muted">
        {driver ?? "No driver set"} · {trip.purpose ?? "No destination"}
        <br />
        Left {formatShortDateTime(trip.started_at)} at {num(trip.start_odometer)} km
      </div>
      <div className="grid grid-cols-2 gap-3 items-end">
        <label>
          <span className="label">Odometer now (km)</span>
          <input className="input tabular text-lg" inputMode="numeric" value={end} onChange={e => setEnd(e.target.value)} onKeyDown={blockEnter} required autoFocus />
        </label>
        <div>
          <p className="stat-label">Distance</p>
          <p className={`display text-3xl mt-1 ${distance !== null && distance < 0 ? "text-bad" : "text-white"}`}>
            {distance === null || Number.isNaN(distance) ? "—" : `${num(distance)} km`}
          </p>
        </div>
      </div>
      <label>
        <span className="label">Notes</span>
        <input className="input" name="notes" placeholder="Optional, e.g. 2 drops, tolls paid" />
      </label>
      <div className="modal-footer">
        <button type="submit" className="btn btn-good" disabled={busy || distance === null || distance < 0}>
          <Flag size={14} /> {busy ? "Saving…" : "End trip"}
        </button>
      </div>
    </form>
  )
}

function FuelForm({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const { busy, error, run } = useSubmit(onClose)
  const sym = currencySymbol()
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={e => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        run(() =>
          logFuel({
            vehicle_id: vehicle.id,
            odometer: optionalInt(form.get("odometer")),
            liters: Number(form.get("liters")),
            cost: Number(form.get("cost")),
            station: String(form.get("station")),
          }),
        )
      }}
    >
      {error && <p className="alert alert-error">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        <label>
          <span className="label">Liters</span>
          <input className="input tabular" name="liters" inputMode="decimal" required autoFocus onKeyDown={blockEnter} />
        </label>
        <label>
          <span className="label">Paid ({sym})</span>
          <input className="input tabular" name="cost" inputMode="decimal" required onKeyDown={blockEnter} />
        </label>
        <label>
          <span className="label">Odometer</span>
          <input className="input tabular" name="odometer" inputMode="numeric" defaultValue={vehicle.odometer} onKeyDown={blockEnter} />
        </label>
      </div>
      <label>
        <span className="label">Station</span>
        <input className="input" name="station" placeholder="Optional" />
      </label>
      <div className="modal-footer">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <Fuel size={14} /> {busy ? "Saving…" : "Save fuel log"}
        </button>
      </div>
    </form>
  )
}

function VehicleForm({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const { busy, error, run } = useSubmit(onClose)
  const [code, setCode] = useState(() => vehicle?.code ?? generateCode("VH"))
  const [active, setActive] = useState(vehicle?.active ?? true)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={e => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        run(() =>
          saveVehicle(vehicle?.id ?? null, {
            name: String(form.get("name")),
            plate_number: String(form.get("plate_number")),
            odometer: Number(form.get("odometer")),
            notes: String(form.get("notes")),
            code,
            active,
          }),
        )
      }}
    >
      {error && <p className="alert alert-error">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Name *</span>
          <input className="input" name="name" defaultValue={vehicle?.name} placeholder="e.g. Truck 1, Isuzu Elf" required autoFocus />
        </label>
        <label>
          <span className="label">Plate number</span>
          <input className="input" name="plate_number" defaultValue={vehicle?.plate_number ?? ""} placeholder="ABC 1234" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Odometer now (km)</span>
          <input className="input tabular" name="odometer" inputMode="numeric" defaultValue={vehicle?.odometer ?? 0} onKeyDown={blockEnter} required />
        </label>
        <div>
          <span className="label">Tag code *</span>
          <div className="flex gap-2">
            <input className="input mono" value={code} onChange={e => setCode(e.target.value)} {...codeFieldProps} required />
            <button type="button" className="btn btn-secondary btn-icon shrink-0" onClick={() => setCode(generateCode("VH"))} title="New code">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>
      <label>
        <span className="label">Notes</span>
        <input className="input" name="notes" defaultValue={vehicle?.notes ?? ""} placeholder="e.g. Registration due March" />
      </label>
      {vehicle && (
        <label className="check-row">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          <span className="text-sm">Active (untick for sold or retired vehicles; history is kept)</span>
        </label>
      )}
      <p className="hint -mt-2">Print the tag and stick it on the key ring or dashboard. Drivers scan it to start and end trips.</p>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  )
}
