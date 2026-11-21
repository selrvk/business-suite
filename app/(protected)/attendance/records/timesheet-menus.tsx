"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Download, MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { downloadExcel, type ExportRow } from "@/components/export-button"
import type { Employee } from "@/lib/types"

/** The header's "More" menu: export the summary or every punch. */
export function TimesheetMenu({ summaryRows, detailRows, from, to }: { summaryRows: ExportRow[]; detailRows: ExportRow[]; from: string; to: string }) {
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
        <button type="button" className="btn btn-secondary" aria-label="More timesheet actions" disabled={state === "busy"}>
          <MoreHorizontal size={15} aria-hidden /> {state === "busy" ? "Exporting…" : state === "failed" ? "Export failed" : "More"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => run(summaryRows, "timesheet_summary", "Summary")}>
          <Download /> Export summary
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run(detailRows, "timesheet_detail", "Punches")}>
          <Download /> Export all punches
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Picks one employee (or everyone); applies straight away. */
export function EmployeeFilter({ employees, employeeId, from, to }: { employees: Employee[]; employeeId: number | null; from: string; to: string }) {
  const router = useRouter()
  return (
    <select
      className="input w-auto min-w-48"
      aria-label="Employee"
      value={employeeId ?? ""}
      onChange={e => router.push(`/attendance/records?${new URLSearchParams({ from, to, ...(e.target.value ? { employee: e.target.value } : {}) })}`)}
    >
      <option value="">Everyone</option>
      {employees.map(e => (
        <option key={e.id} value={e.id}>
          {e.name}
          {e.active ? "" : " (inactive)"}
        </option>
      ))}
    </select>
  )
}
