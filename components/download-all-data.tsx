"use client"

import { useState } from "react"
import { DatabaseBackup } from "lucide-react"
import { exportTablePage } from "@/app/(protected)/settings/data-export"
import { EXPORT_TABLES } from "@/app/(protected)/settings/data-tables"
import { config } from "@/lib/config"

/** Downloads every record of the business as one Excel file, one sheet per kind of record. */
export function DownloadAllData({ businessName, slug, className = "btn btn-secondary" }: { businessName: string; slug: string; className?: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setError(null)
    try {
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new()
      const counts: [string, string, number][] = []
      const sheets: [string, Record<string, unknown>[]][] = []
      for (const [i, spec] of EXPORT_TABLES.entries()) {
        setBusy(`${spec.sheet} (${i + 1} of ${EXPORT_TABLES.length})`)
        const rows: Record<string, unknown>[] = []
        for (let page = 0; ; page++) {
          const result = await exportTablePage(spec.table, page)
          if (!result.ok) throw new Error(i === 0 ? result.error : `${spec.sheet}: ${result.error}`)
          rows.push(...result.data.rows)
          if (!result.data.more) break
        }
        counts.push([spec.sheet, spec.about, rows.length])
        if (rows.length) sheets.push([spec.sheet, rows])
      }

      const exportedAt = new Date().toLocaleString()
      const about = XLSX.utils.aoa_to_sheet([
        [`${businessName}: all records`],
        [`Downloaded ${exportedAt}`],
        [],
        ["Sheet", "What's in it", "Rows"],
        ...counts,
        [],
        [`Times are in ${config.timeZone} time. Sheets with no rows are left out.`],
      ])
      about["!cols"] = [{ wch: 18 }, { wch: 44 }, { wch: 8 }]
      XLSX.utils.book_append_sheet(wb, about, "Read me")
      for (const [name, rows] of sheets) {
        const ws = XLSX.utils.json_to_sheet(rows)
        const headers = Object.keys(rows[0] ?? {})
        ws["!cols"] = headers.map(h => ({ wch: Math.min(40, Math.max(h.length, ...rows.slice(0, 200).map(r => String(r[h] ?? "").length)) + 2) }))
        XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
      }
      XLSX.writeFile(wb, `${slug}_all-data_${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download didn't finish.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" className={className} onClick={run} disabled={!!busy}>
        <DatabaseBackup size={14} />
        {busy ? `Getting ${busy}…` : "Download all my data"}
      </button>
      {error && <p className="alert alert-error text-xs">{error}</p>}
    </div>
  )
}
