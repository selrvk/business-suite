"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import type { ActionResult } from "@/lib/types"

export type ExportRow = Record<string, string | number | null | undefined>

/**
 * Downloads rows as an Excel file. Pass `rows` directly, or `load` (a server
 * action) to fetch everything at click time.
 */
export function ExportButton({
  rows,
  load,
  filename,
  sheet = "Sheet1",
  label = "Export to Excel",
  className = "btn btn-secondary",
}: {
  rows?: ExportRow[]
  load?: () => Promise<ActionResult<ExportRow[]>>
  filename: string
  sheet?: string
  label?: string
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      let data = rows ?? []
      if (load) {
        const result = await load()
        if (!result.ok) throw new Error(result.error)
        data = result.data
      }
      const XLSX = await import("xlsx")
      const ws = XLSX.utils.json_to_sheet(data)
      const headers = Object.keys(data[0] ?? {})
      ws["!cols"] = headers.map(h => ({
        wch: Math.min(48, Math.max(h.length, ...data.slice(0, 200).map(r => String(r[h] ?? "").length)) + 2),
      }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31))
      XLSX.writeFile(wb, `${filename}.xlsx`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" className={className} onClick={run} disabled={busy} title={error ?? undefined}>
      <Download size={14} />
      {busy ? "Exporting…" : error ? "Export failed — retry" : label}
    </button>
  )
}
