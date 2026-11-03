"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckCircle2, FileClock, Upload } from "lucide-react"
import { formatDate, formatShortDateTime, num, startOfDay, toYmd } from "@/lib/format"
import {
  MAX_PUNCHES,
  SCAN_FIELDS,
  badgeKey,
  findLayout,
  guessDateOrder,
  payload,
  people,
  readPunches,
  text,
  textRows,
  usesSlashDates,
  type DateOrder,
  type Layout,
  type ScanField,
} from "@/lib/scanner-import"
import type { PunchImportResult } from "@/lib/types"
import { importPunches } from "../actions"

export type ImportEmployee = { id: number; name: string; code: string; active: boolean }
type FileData = { fileName: string; sheetName: string | null; cells: unknown[][]; firstLine: number }

const SPREADSHEET = /\.(xlsx|xlsm|xls|ods|csv)$/i

/** Spreadsheet column letters: 0 → A, 26 → AA. */
function columnLetter(i: number): string {
  return (i >= 26 ? columnLetter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26))
}

const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`

/** The column with the punch time: a date-and-time column, or else the date column. */
function timeColumn(layout: Layout) {
  const datetime = layout.mapping.indexOf("datetime")
  return datetime >= 0 ? datetime : layout.mapping.indexOf("date")
}

async function readFile(file: File): Promise<FileData> {
  if (SPREADSHEET.test(file.name)) {
    const XLSX = await import("xlsx")
    // CSV cells stay as typed, so numbers like 007 keep their zeros.
    const csv = /\.csv$/i.test(file.name)
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: csv, dense: true })
    let first: FileData | null = null
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName]
      const cells = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true })
      if (!cells.some(r => r.some(c => text(c)))) continue
      const firstLine = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.r + 1 : 1
      const found = { fileName: file.name, sheetName, cells, firstLine }
      first ??= found
      const layout = findLayout(cells)
      if (layout.mapping.includes("code") && timeColumn(layout) >= 0) return found
    }
    if (!first) throw new Error("That file looks empty.")
    return first
  }
  // Plain-text logs like attlog.dat. Some scanners save them as UTF-16.
  const bytes = new Uint8Array(await file.arrayBuffer())
  const utf16 = (bytes[0] === 0xff && bytes[1] === 0xfe) || bytes.subarray(0, 400).filter(b => b === 0).length > 40
  const cells = textRows(new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(bytes))
  if (!cells.length) throw new Error("That file looks empty.")
  return { fileName: file.name, sheetName: null, cells, firstLine: 1 }
}

export function ScannerImport({ employees }: { employees: ImportEmployee[] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<FileData | null>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [order, setOrder] = useState<DateOrder>("mdy")
  const [orderFromFile, setOrderFromFile] = useState(false)
  const [from, setFrom] = useState("")
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<PunchImportResult | null>(null)

  // Scanner number → employee. An exact badge code wins over one that only matches without leading zeros.
  const match = useMemo(() => {
    const map = new Map<string, ImportEmployee[]>()
    for (const e of employees) map.set(badgeKey(e.code), [...(map.get(badgeKey(e.code)) ?? []), e])
    return (code: string) => {
      const found = map.get(badgeKey(code)) ?? []
      return found.find(e => e.code === code.trim()) ?? found[0] ?? null
    }
  }, [employees])

  const read = useMemo(() => (file && layout ? readPunches(file.cells, layout, order, file.firstLine) : { punches: [], problems: [] }), [file, layout, order])
  const range = useMemo(() => {
    if (!read.punches.length) return null
    let first = read.punches[0].at
    let last = first
    for (const p of read.punches) {
      if (p.at < first) first = p.at
      if (p.at > last) last = p.at
    }
    return { first: toYmd(first), last: toYmd(last) }
  }, [read])
  const chosen = useMemo(() => {
    const since = from ? startOfDay(from) : null
    return since ? read.punches.filter(p => p.at >= since) : read.punches
  }, [read, from])
  const rows = useMemo(() => people(chosen).map(p => ({ ...p, employee: match(p.code) })), [chosen, match])
  const matchedKeys = useMemo(() => new Set(rows.filter(r => r.employee).map(r => r.key)), [rows])
  const toSend = useMemo(() => chosen.filter(p => matchedKeys.has(badgeKey(p.code))), [chosen, matchedKeys])
  const unmatched = rows.filter(r => !r.employee)
  const hasNames = rows.some(r => r.name)
  const slashDates = useMemo(() => {
    if (!file || !layout) return false
    const col = timeColumn(layout)
    return col >= 0 && usesSlashDates(file.cells.slice(layout.headerIndex + 1, layout.headerIndex + 2001).map(r => r[col]))
  }, [file, layout])
  const ready = !!layout && layout.mapping.includes("code") && timeColumn(layout) >= 0
  const tooMany = toSend.length > MAX_PUNCHES

  async function open(picked: File) {
    setError(null)
    setDone(null)
    if (picked.size > 20 * 1024 * 1024) return setError("That file is over 20 MB. Save a shorter date range from the scanner.")
    setReading(true)
    try {
      const data = await readFile(picked)
      const found = findLayout(data.cells)
      const col = timeColumn(found)
      const guess = col >= 0 ? guessDateOrder(data.cells.slice(found.headerIndex + 1, found.headerIndex + 5001).map(r => r[col])) : null
      setOrder(guess ?? "mdy")
      setOrderFromFile(!!guess)
      setFile(data)
      setLayout(found)
      setFrom("")
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't read that file. Upload the file exactly as the scanner saved it.")
    } finally {
      setReading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function choose(column: number, field: ScanField | null) {
    if (!layout) return
    // Each field comes from one column, and a date-and-time column replaces separate date and time columns.
    const clash = (f: ScanField | null) =>
      f === field || (field === "datetime" && (f === "date" || f === "time")) || ((field === "date" || field === "time") && f === "datetime")
    setLayout({ ...layout, mapping: layout.mapping.map((f, i) => (i === column ? field : clash(f) ? null : f)) })
  }

  async function save() {
    if (!file) return
    setSaving(true)
    setError(null)
    const result = await importPunches(payload(toSend), file.fileName)
    setSaving(false)
    if (!result.ok) return setError(result.error)
    setDone(result.data)
    setFile(null)
    setLayout(null)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="alert alert-error">{error}</p>}
      {done && <Result result={done} />}

      <section className="card">
        <div className="card-header">
          <FileClock size={15} className="text-brand" />
          <h2 className="display text-xl text-white">{file ? file.fileName : "Your scanner's file"}</h2>
          {file?.sheetName && <span className="text-xs faint ml-auto">Sheet “{file.sheetName}”</span>}
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
              const dropped = e.dataTransfer.files[0]
              if (dropped) open(dropped)
            }}
          >
            <p className="text-sm muted">Drop the attendance file from your scanner here: the .dat or .txt log, or an Excel or CSV report.</p>
            <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={reading || saving}>
              <Upload size={14} /> {reading ? "Reading…" : file ? "Choose another file" : "Choose a file"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".dat,.txt,.log,.csv,.xls,.xlsx,text/plain,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={e => {
                const picked = e.target.files?.[0]
                if (picked) open(picked)
              }}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <p className="text-white font-semibold mb-2">Getting the file</p>
              <ol className="list-decimal pl-5 flex flex-col gap-1 muted">
                <li>Plug a USB flash drive into the scanner.</li>
                <li>
                  On the scanner, open <strong className="text-white">Menu → USB Manager → Download → Attendance data</strong>. Some models call it
                  Data Mgt or Pen Drive Mng.
                </li>
                <li>It saves a file like 1_attlog.dat, or an Excel report. Upload that file here.</li>
              </ol>
            </div>
            <div>
              <p className="text-white font-semibold mb-2">Good to know</p>
              <ul className="list-disc pl-5 flex flex-col gap-1 muted">
                <li>
                  Each person&apos;s number on the scanner (User ID, AC-No. or Enroll No.) must match their badge code on the{" "}
                  <Link href="/employees" className="underline">
                    Employees
                  </Link>{" "}
                  page.
                </li>
                <li>Upload the whole file every time. Punches already imported are skipped, so nothing is counted twice.</li>
                <li>A punch is a clock-in, and the next punch within 16 hours is the clock-out. Second taps within 2 minutes are ignored.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {file && layout && (
        <section className="card">
          <div className="card-header">
            <h2 className="display text-xl text-white">Columns</h2>
            <span className="text-xs faint ml-auto">Check each column is read as the right thing</span>
          </div>
          <div className="card-body flex flex-col gap-4">
            {!ready && <p className="alert alert-warn">Pick the column with each person&apos;s number on the scanner, and the one with the date and time.</p>}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {layout.mapping.map((field, i) => {
                const header = layout.headers[i]
                const sample = text(file.cells.slice(layout.headerIndex + 1).find(r => text(r[i]))?.[i])
                if (!header && !sample) return null
                return (
                  <label key={i} className="flex flex-col gap-1 rounded-lg p-3" style={{ background: "var(--app-bg)" }}>
                    <span className="text-sm font-semibold text-white truncate">{header || `Column ${columnLetter(i)}`}</span>
                    <span className="text-xs faint truncate">{sample ? `e.g. ${sample}` : "empty"}</span>
                    <select className="input mt-1" value={field ?? ""} onChange={e => choose(i, (e.target.value || null) as ScanField | null)}>
                      <option value="">Don&apos;t use</option>
                      {SCAN_FIELDS.map(f => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              })}
            </div>
            {slashDates && (
              <label className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-white">Dates like 05/10/2026 are</span>
                <select className="input w-auto" value={order} onChange={e => setOrder(e.target.value as DateOrder)}>
                  <option value="mdy">month/day/year (May 10)</option>
                  <option value="dmy">day/month/year (5 October)</option>
                </select>
                <span className="text-xs faint">{orderFromFile ? "Worked out from the dates in the file." : "The file doesn't show which, so check one date you know."}</span>
              </label>
            )}
            {read.problems.length > 0 && (
              <p className="text-xs faint">
                {plural(read.problems.length, "row")} couldn&apos;t be read as a punch and will be skipped (row {read.problems.slice(0, 5).join(", ")}
                {read.problems.length > 5 ? "…" : ""}). Title and total lines in reports are normal here.
              </p>
            )}
          </div>
        </section>
      )}

      {file && ready && (
        <section className="card">
          <div className="card-header flex-wrap gap-2">
            <h2 className="display text-xl text-white mr-auto">People in the file</h2>
            {range && (
              <label className="flex items-center gap-2 text-xs muted">
                Import from
                <input type="date" className="input w-auto" value={from || range.first} min={range.first} max={range.last} onChange={e => setFrom(e.target.value)} />
                to {formatDate(startOfDay(range.last))}
              </label>
            )}
          </div>
          {unmatched.length > 0 && (
            <div className="card-body pb-0">
              <p className="alert alert-warn">
                {plural(unmatched.length, "number")} on the scanner {unmatched.length === 1 ? "doesn't" : "don't"} match anyone&apos;s badge code, so{" "}
                {unmatched.length === 1 ? "its" : "their"} punches will be skipped. Set that person&apos;s badge code on the{" "}
                <Link href="/employees" className="underline">
                  Employees
                </Link>{" "}
                page, then upload the file again.
              </p>
            </div>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>No. on scanner</th>
                  {hasNames && <th>Name in the file</th>}
                  <th>Employee</th>
                  <th className="num">Punches</th>
                  <th>First</th>
                  <th>Last</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key}>
                    <td className="mono">{r.code}</td>
                    {hasNames && <td className="muted">{r.name ?? <span className="faint">—</span>}</td>}
                    <td>
                      {r.employee ? (
                        <span className="text-white">
                          {r.employee.name}
                          {!r.employee.active && <span className="faint text-xs"> · inactive</span>}
                        </span>
                      ) : (
                        <span className="pill" data-tone="warn">
                          No match
                        </span>
                      )}
                    </td>
                    <td className="num">{num(r.count)}</td>
                    <td className="text-xs muted">{formatShortDateTime(r.first)}</td>
                    <td className="text-xs muted">{formatShortDateTime(r.last)}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={hasNames ? 6 : 5} className="text-center faint py-8">
                      No punches in this date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="card-body flex flex-wrap items-center gap-3 border-t" style={{ borderColor: "var(--app-border)" }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={save} disabled={saving || !toSend.length || tooMany}>
              <Upload size={16} />
              {saving ? "Importing…" : toSend.length ? `Import ${plural(toSend.length, "punch", "punches")}` : "Nothing to import"}
            </button>
            <span className="text-xs faint">
              {tooMany
                ? `That's over ${num(MAX_PUNCHES)} punches. Pick a later "Import from" date.`
                : "Times are read as your local time. Nothing is saved until you click Import."}
            </span>
          </div>
        </section>
      )}
    </div>
  )
}

function Result({ result: r }: { result: PunchImportResult }) {
  const recorded = r.covered + r.overlaps
  const details = [
    r.new && `${plural(r.new, "new punch", "new punches")}`,
    r.already && `${plural(r.already, "punch", "punches")} imported before, skipped`,
    r.closed && `${plural(r.closed, "open shift")} clocked out`,
    r.open && `${plural(r.open, "person", "people")} still at work`,
    r.missed && `${plural(r.missed, "missed clock-out")} to check in Timesheets`,
    r.doubles && `${plural(r.doubles, "second tap")} ignored`,
    recorded && `${plural(recorded, "punch", "punches")} already recorded at the time clock`,
    r.future && `${plural(r.future, "punch", "punches")} dated in the future, skipped (check the scanner's clock)`,
    r.unmatched.length && `${plural(r.unmatched.length, "scanner number")} with no matching employee`,
  ].filter(Boolean)
  return (
    <div className="alert alert-success flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <CheckCircle2 size={16} />
        <strong>{r.new ? `Imported: ${plural(r.shifts, "shift")} added.` : "Nothing new: every punch in this file was imported before."}</strong>
        <Link href="/attendance/records" className="underline">
          See timesheets
        </Link>
      </p>
      {details.length > 0 && <p className="text-xs">{details.join(" · ")}</p>}
    </div>
  )
}
