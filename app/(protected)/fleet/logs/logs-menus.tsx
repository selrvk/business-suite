"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Download, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { downloadExcel, type ExportRow } from "@/components/export-button"

/** The header's "More" menu: export trips or fuel. */
export function LogsMenu({ tripRows, fuelRows, from, to }: { tripRows: ExportRow[]; fuelRows: ExportRow[]; from: string; to: string }) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle")
  async function run(rows: ExportRow[], name: string, sheet: string) {
    setState("busy")
    try {
      await downloadExcel(rows, `${name}_${from}_to_${to}`, sheet)
      setState("idle")
    } catch {
      setState("failed")
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="btn btn-secondary" aria-label="More log actions" disabled={state === "busy"}>
          <MoreHorizontal size={15} aria-hidden /> {state === "busy" ? "Exporting…" : state === "failed" ? "Export failed" : "More"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => run(tripRows, "trips", "Trips")}>
          <Download /> Export trips
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run(fuelRows, "fuel", "Fuel")}>
          <Download /> Export fuel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Picks one vehicle (or all); applies straight away. */
export function VehicleFilter({ vehicles, vehicleId, from, to }: { vehicles: { id: number; name: string }[]; vehicleId: number | null; from: string; to: string }) {
  const router = useRouter()
  return (
    <select
      className="input w-auto min-w-48"
      aria-label="Vehicle"
      value={vehicleId ?? ""}
      onChange={e => router.push(`/fleet/logs?${new URLSearchParams({ from, to, ...(e.target.value ? { vehicle: e.target.value } : {}) })}`)}
    >
      <option value="">All vehicles</option>
      {vehicles.map(v => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  )
}
