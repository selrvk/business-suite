"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react"
import { money, num } from "@/lib/format"
import {
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  findHeader,
  planRows,
  readRows,
  text,
  type ImportField,
  type RowPlan,
} from "@/lib/product-import"
import type { Item } from "@/lib/types"
import { importProducts } from "../actions"

type Sheet = { fileName: string; sheetName: string; cells: unknown[][]; headerIndex: number; headers: string[]; firstLine: number }
type Kind = RowPlan["kind"]
type Done = { added: number; updated: number; unchanged: number; skipped: number }

const SHOWN = 300
const STATUS: Record<Kind, { label: string; tone?: string }> = {
  new: { label: "New", tone: "good" },
  update: { label: "Update", tone: "info" },
  same: { label: "No change" },
  problem: { label: "Problem", tone: "bad" },
}

const FIELD_HELP: Record<ImportField, string> = {
  name: "Name (required)",
  barcode: "Barcode",
  brand: "Brand",
  unit: "Unit (pieces, boxes…)",
  stock: "Stock",
  price_buy: "Cost (what you pay)",
  price_sell: "Price (what you charge)",
}

/** Spreadsheet column letters: 0 → A, 26 → AA. */
function columnLetter(i: number): string {
  return (i >= 26 ? columnLetter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26))
}

async function downloadTemplate() {
  const XLSX = await import("xlsx")
  const ws = XLSX.utils.aoa_to_sheet([
    ["Barcode", "Name", "Brand", "Unit", "Stock", "Cost", "Price"],
    ["4800000000017", "Bottled water 500ml", "", "bottles", 48, 9.5, 15],
    ["", "Rice 25kg", "", "sacks", 6, 1150, 1300],
  ])
  ws["!cols"] = [16, 28, 14, 10, 8, 10, 10].map(wch => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Products")
  XLSX.writeFile(wb, "products_template.xlsx")
}

export function ProductImport({ items }: { items: Item[] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [mapping, setMapping] = useState<(ImportField | null)[]>([])
  const [setStock, setSetStock] = useState(false)
  const [filter, setFilter] = useState<Kind | "all">("all")
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)

  const rows = useMemo(() => (sheet ? readRows(sheet.cells, sheet.headerIndex, mapping, sheet.firstLine) : []), [sheet, mapping])
  const plans = useMemo(() => planRows(rows, items, setStock), [rows, items, setStock])
  const counts = useMemo(() => {
    const c: Record<Kind, number> = { new: 0, update: 0, same: 0, problem: 0 }
    for (const p of plans) c[p.kind]++
    return c
  }, [plans])
  const hasName = mapping.includes("name")
  const toSave = rows.filter((_, i) => plans[i].kind === "new" || plans[i].kind === "update")
  const visible = rows.map((r, i) => ({ ...r, plan: plans[i] })).filter(r => filter === "all" || r.plan.kind === filter)

  async function open(file: File) {
    setError(null)
    setDone(null)
    if (file.size > 10 * 1024 * 1024) return setError("That file is over 10 MB. Split it into smaller files.")
    setReading(true)
    try {
      const XLSX = await import("xlsx")
      // CSV cells stay as typed, so barcodes keep leading zeros.
      const csv = /\.(csv|tsv|txt)$/i.test(file.name)
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: csv, dense: true })
      let chosen: { sheet: Sheet; mapping: (ImportField | null)[] } | null = null
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName]
        const cells = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true })
        if (!cells.some(r => r.some(c => text(c)))) continue
        const header = findHeader(cells)
        const firstLine = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.r + 1 : 1
        const found = { sheet: { fileName: file.name, sheetName, cells, headerIndex: header.index, headers: header.headers, firstLine }, mapping: header.mapping }
        if (!chosen) chosen = found
        if (header.mapping.includes("name")) {
          chosen = found
          break
        }
      }
      if (!chosen) throw new Error("That file looks empty.")
      const dataRows = chosen.sheet.cells.length - chosen.sheet.headerIndex - 1
      if (dataRows > MAX_IMPORT_ROWS) throw new Error(`That file has more than ${num(MAX_IMPORT_ROWS)} rows. Split it into smaller files.`)
      setSheet(chosen.sheet)
      setMapping(chosen.mapping)
      setFilter("all")
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't read that file. Save it as .xlsx or .csv and try again.")
    } finally {
      setReading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function choose(column: number, field: ImportField | null) {
    // Each field comes from one column: picking it here frees it elsewhere.
    setMapping(m => m.map((f, i) => (i === column ? field : f === field ? null : f)))
  }

  async function save() {
    setSaving(true)
    setError(null)
    const result = await importProducts(toSave.map(r => r.row), setStock)
    setSaving(false)
    if (!result.ok) return setError(result.error)
    setDone({ ...result.data, skipped: counts.problem })
    setSheet(null)
    setMapping([])
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="alert alert-error">{error}</p>}
      {done && (
        <div className="alert alert-success flex flex-wrap items-center gap-x-4 gap-y-2">
          <CheckCircle2 size={16} />
          <span>
            Imported: {num(done.added)} added, {num(done.updated)} updated
            {done.skipped ? `, ${num(done.skipped)} rows with problems skipped` : ""}.
          </span>
          <Link href="/inventory" className="underline">
            See your products
          </Link>
        </div>
      )}

      <section className="card">
        <div className="card-header">
          <FileSpreadsheet size={15} className="text-brand" />
          <h2 className="display text-xl text-white">{sheet ? sheet.fileName : "Your file"}</h2>
          {sheet && <span className="text-xs faint ml-auto">Sheet “{sheet.sheetName}”</span>}
        </div>
        <div className="card-body flex flex-col gap-4">
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-xl p-6 text-center border-2 border-dashed transition-colors"
            style={{ background: "var(--app-bg)", borderColor: dragging ? "var(--brand)" : "var(--app-border)" }}
            onDragOver={e => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files[0]
              if (file) open(file)
            }}
          >
            <p className="text-sm muted">
              Drop an Excel (.xlsx, .xls) or CSV file here: one product per row, with column names in the first row.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={reading || saving}>
                <Upload size={14} /> {reading ? "Reading…" : sheet ? "Choose another file" : "Choose a file"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={downloadTemplate}>
                <Download size={14} /> Download a template
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) open(file)
              }}
            />
          </div>
          <ul className="text-xs faint flex flex-col gap-1 list-disc pl-4">
            <li>Columns it looks for: Name (required), Barcode, Brand, Unit, Stock, Cost, Price. Other columns are ignored.</li>
            <li>Products you already have are matched by barcode, or by name when a row has no barcode. Empty cells leave the saved value alone.</li>
            <li>To edit many products at once: export them from the Products page, change the file, and import it here.</li>
          </ul>
        </div>
      </section>

      {sheet && (
        <>
          <section className="card">
            <div className="card-header">
              <h2 className="display text-xl text-white">Columns</h2>
              <span className="text-xs faint ml-auto">Check each column is read as the right thing</span>
            </div>
            <div className="card-body flex flex-col gap-4">
              {!hasName && <p className="alert alert-warn">Pick which column has the product names.</p>}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {sheet.headers.map((header, i) => {
                  const sample = text(sheet.cells.slice(sheet.headerIndex + 1).find(r => text(r[i]))?.[i])
                  if (!header && !sample) return null
                  return (
                    <label key={i} className="flex flex-col gap-1 rounded-lg p-3" style={{ background: "var(--app-bg)" }}>
                      <span className="text-sm font-semibold text-white truncate">{header || `Column ${columnLetter(i)}`}</span>
                      <span className="text-xs faint truncate">{sample ? `e.g. ${sample}` : "empty"}</span>
                      <select
                        className="input mt-1"
                        value={mapping[i] ?? ""}
                        onChange={e => choose(i, (e.target.value || null) as ImportField | null)}
                      >
                        <option value="">Don&apos;t import</option>
                        {IMPORT_FIELDS.map(f => (
                          <option key={f.key} value={f.key}>
                            {FIELD_HELP[f.key]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                })}
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1" checked={setStock} onChange={e => setSetStock(e.target.checked)} />
                <span>
                  <span className="text-white font-medium">Also change the stock of products you already have to the file&apos;s numbers</span>
                  <span className="block text-xs faint">
                    Use this after a stock count. Sales made since the file was exported would be overwritten. New products
                    always start with the file&apos;s stock. Every change is logged.
                  </span>
                </span>
              </label>
            </div>
          </section>

          {hasName && (
            <section className="card">
              <div className="card-header flex-wrap gap-2">
                <h2 className="display text-xl text-white mr-2">Preview</h2>
                {(["all", "new", "update", "same", "problem"] as const).map(kind => (
                  <button
                    key={kind}
                    type="button"
                    className={`btn btn-sm ${filter === kind ? "btn-secondary" : "btn-ghost"}`}
                    onClick={() => setFilter(kind)}
                  >
                    {kind === "all" ? `All ${num(rows.length)}` : `${STATUS[kind].label} ${num(counts[kind])}`}
                  </button>
                ))}
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="num">Row</th>
                      <th>Status</th>
                      <th>Name</th>
                      <th>Barcode</th>
                      <th className="num">Stock</th>
                      <th className="num">Cost</th>
                      <th className="num">Price</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice(0, SHOWN).map(({ row, plan }) => (
                      <tr key={row.line}>
                        <td className="num faint">{row.line}</td>
                        <td>
                          <span className="pill" data-tone={STATUS[plan.kind].tone}>
                            {STATUS[plan.kind].label}
                          </span>
                        </td>
                        <td>
                          <p className="text-white">{row.name || <span className="faint">—</span>}</p>
                          {(row.brand || row.unit) && <p className="text-xs faint">{[row.brand, row.unit].filter(Boolean).join(" · ")}</p>}
                        </td>
                        <td className="mono text-xs">{row.barcode ?? <span className="faint">—</span>}</td>
                        <td className="num">{row.stock === null ? "—" : num(row.stock)}</td>
                        <td className="num">{row.price_buy === null ? "—" : money(row.price_buy)}</td>
                        <td className="num">{row.price_sell === null ? "—" : money(row.price_sell)}</td>
                        <td className={`text-xs ${plan.kind === "problem" ? "text-bad" : "muted"}`}>
                          {plan.kind === "problem" ? plan.problem : plan.kind === "update" ? plan.changes.join(" · ") : ""}
                        </td>
                      </tr>
                    ))}
                    {!visible.length && (
                      <tr>
                        <td colSpan={8} className="text-center faint py-8">
                          Nothing here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {visible.length > SHOWN && (
                <p className="text-xs faint px-5 py-3">
                  Showing the first {SHOWN} of {num(visible.length)}. All of them will be imported.
                </p>
              )}
              <div className="card-body flex flex-wrap items-center gap-3 border-t" style={{ borderColor: "var(--app-border)" }}>
                <button type="button" className="btn btn-primary btn-lg" onClick={save} disabled={saving || !toSave.length}>
                  <Upload size={16} />
                  {saving ? "Importing…" : toSave.length ? `Import ${num(toSave.length)} product${toSave.length === 1 ? "" : "s"}` : "Nothing to import"}
                </button>
                <span className="text-xs faint">
                  {counts.problem > 0 && `${num(counts.problem)} row${counts.problem === 1 ? "" : "s"} with problems will be skipped. `}
                  {counts.same > 0 && `${num(counts.same)} unchanged. `}
                  Nothing is saved until you click Import, and it all saves together or not at all.
                </span>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
