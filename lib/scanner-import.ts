/**
 * Reading the attendance file a fingerprint or face scanner saves to a USB
 * stick: ZKTeco's attlog.dat, or an Excel/CSV report from ZKTeco, Realand and
 * similar machines. Works out which column is the person's number on the
 * scanner and which is the time, then reads each row as a punch. The import
 * page shows the result before anything is saved; import_punches() in
 * supabase/schema.sql matches the numbers to employees and pairs the punches
 * into shifts. Safe to import anywhere.
 */
import { zonedToDate } from "./format"

export const MAX_PUNCHES = 50000

export type ScanField = "code" | "datetime" | "date" | "time" | "name"
export type DateOrder = "mdy" | "dmy"
export type Punch = { line: number; code: string; name: string | null; at: Date }

export const SCAN_FIELDS: { key: ScanField; label: string }[] = [
  { key: "code", label: "Scanner number" },
  { key: "datetime", label: "Date and time" },
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "name", label: "Name" },
]

/** Column names scanners and their software use, compared without spaces, symbols or case. */
const COLUMN_NAMES: Record<ScanField, string[]> = {
  code: [
    "acno", "acnumber", "userid", "userno", "usernumber", "enrollid", "enrollno", "enrollnumber", "enrollmentno", "enrollmentnumber",
    "employeeid", "employeeno", "employeenumber", "employeecode", "empid", "empno", "empcode", "badge", "badgeno", "badgecode",
    "personid", "personnelid", "personno", "staffid", "staffno", "pin", "idno", "no", "id", "number", "code", "user",
  ],
  datetime: ["datetime", "checktime", "punchtime", "clocktime", "logtime", "recordtime", "attendancetime", "verifytime", "timestamp", "checkdatetime", "punch"],
  date: ["date", "day", "punchdate", "checkdate", "logdate", "attendancedate"],
  time: ["time", "checkintime", "hour"],
  name: ["name", "username", "employeename", "empname", "fullname", "staffname", "personname", "firstname"],
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

export function text(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

/** A scanner number or badge code, ignoring case and leading zeros ("007" = "7"). Same as badge_key() in the database. */
export function badgeKey(code: string) {
  const c = code.trim()
  return /^[0-9]+$/.test(c) ? c.replace(/^0+(?=.)/, "") : c.toLowerCase()
}

/** Rows of a plain-text export (attlog.dat and similar): tab-separated, or commas, or spaces. */
export function textRows(content: string): string[][] {
  return content
    .split(/\r?\n/)
    .map(line => line.replace(/^\uFEFF/, ""))
    .filter(line => line.trim())
    .map(line => {
      if (line.includes("\t")) return line.split("\t").map(c => c.trim())
      if (/[,;]/.test(line) && !/[A-Za-z]{3,}\.? \d{1,2},/.test(line)) return line.split(/[,;]/).map(c => c.trim().replace(/^"(.*)"$/, "$1"))
      return line.trim().split(/\s+/)
    })
}

// ---------------------------------------------------------------------------
// Dates and times
// ---------------------------------------------------------------------------

type Clock = { y: number; m: number; d: number; h: number; mi: number; s: number }
type Day = Pick<Clock, "y" | "m" | "d">
type Hms = Pick<Clock, "h" | "mi" | "s">

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const TIME = String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp])?\.?[Mm]?\.?`
const ISO = new RegExp(String.raw`^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]+${TIME})?(?:Z|[+-]\d{2}:?\d{2})?$`)
const SLASH = new RegExp(String.raw`^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:,?\s+${TIME})?$`)
const DAY_MONTH = new RegExp(String.raw`^(\d{1,2})[- ]([A-Za-z]{3,9})\.?[- ,]+(\d{4}|\d{2})(?:,?\s+${TIME})?$`)
const MONTH_DAY = new RegExp(String.raw`^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})(?:,?\s+${TIME})?$`)
const TIME_ONLY = new RegExp(String.raw`^${TIME}$`)

const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))
const month = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1

function hms(h?: string, mi?: string, s?: string, ap?: string): Hms | null {
  if (h === undefined) return { h: 0, mi: 0, s: 0 }
  let hour = Number(h)
  const minute = Number(mi), second = Number(s ?? 0)
  if (ap) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (ap.toLowerCase() === "p" ? 12 : 0)
  }
  if (hour > 23 || minute > 59 || second > 59) return null
  return { h: hour, mi: minute, s: second }
}

function validDay(y: number, m: number, d: number): Day | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null
  return { y, m, d }
}

/** An Excel date serial (days since 1899-12-30) as wall-clock parts. */
function fromSerial(serial: number): Clock {
  const t = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400) * 1000)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds() }
}

/**
 * A date, with or without a time, from a cell. Slash dates like 05/10/2026 are
 * read month first unless `order` is "dmy". Returns null when it isn't one.
 */
export function readWhen(value: unknown, order: DateOrder = "mdy"): { day: Day; time: Hms | null } | null {
  if (typeof value === "number") {
    if (value < 36526 || value > 73051) return null // 2000 to 2100
    const c = fromSerial(value)
    return { day: { y: c.y, m: c.m, d: c.d }, time: value % 1 ? { h: c.h, mi: c.mi, s: c.s } : null }
  }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    return {
      day: { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() },
      time: { h: value.getHours(), mi: value.getMinutes(), s: value.getSeconds() },
    }
  }
  const v = text(value).replace(/\s+/g, " ")
  let m = ISO.exec(v)
  let day: Day | null = null
  let time: Hms | null = null
  if (m) {
    day = validDay(Number(m[1]), Number(m[2]), Number(m[3]))
    time = m[4] === undefined ? null : hms(m[4], m[5], m[6], m[7])
  } else if ((m = SLASH.exec(v))) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    day = order === "dmy" ? validDay(year(m[3]), b, a) : validDay(year(m[3]), a, b)
    time = m[4] === undefined ? null : hms(m[4], m[5], m[6], m[7])
  } else if ((m = DAY_MONTH.exec(v))) {
    day = validDay(year(m[3]), month(m[2]), Number(m[1]))
    time = m[4] === undefined ? null : hms(m[4], m[5], m[6], m[7])
  } else if ((m = MONTH_DAY.exec(v))) {
    day = validDay(Number(m[3]), month(m[1]), Number(m[2]))
    time = m[4] === undefined ? null : hms(m[4], m[5], m[6], m[7])
  } else return null
  if (!day) return null
  if (time === null && /\d:\d/.test(v)) return null // had a time, but not a valid one
  return { day, time }
}

/** A time of day from a cell ("08:01", "8:01:30 PM", or an Excel time fraction). */
export function readTime(value: unknown): Hms | null {
  if (typeof value === "number") {
    if (value < 0 || value >= 1) return null
    const c = fromSerial(value)
    return { h: c.h, mi: c.mi, s: c.s }
  }
  const m = TIME_ONLY.exec(text(value))
  return m ? hms(m[1], m[2], m[3], m[4]) : null
}

/** Whether a date written like 05/10/2026 is month-first or day-first, judging from all of them (null when every one could be either). */
export function guessDateOrder(values: unknown[]): DateOrder | null {
  let mdy = false
  let dmy = false
  for (const value of values) {
    if (typeof value !== "string") continue
    const m = SLASH.exec(value.trim().replace(/\s+/g, " "))
    if (!m) continue
    if (Number(m[1]) > 12) dmy = true
    if (Number(m[2]) > 12) mdy = true
  }
  return dmy && !mdy ? "dmy" : mdy && !dmy ? "mdy" : null
}

export function usesSlashDates(values: unknown[]) {
  return values.some(v => typeof v === "string" && SLASH.test(v.trim().replace(/\s+/g, " ")))
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export type Layout = { headerIndex: number; headers: string[]; mapping: (ScanField | null)[] }

const codeLike = (v: unknown) => {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 && v < 1e9
  const t = text(v)
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/.test(t) && !TIME_ONLY.test(t)
}

/** Which field a column header means. */
export function guessField(header: string): ScanField | null {
  const h = squash(header)
  if (!h) return null
  for (const field of ["datetime", "code", "date", "time", "name"] as ScanField[]) {
    if (COLUMN_NAMES[field].includes(h)) return field
  }
  if (h.includes("date") && h.includes("time")) return "datetime"
  if (h.includes("name")) return "name"
  return null
}

/**
 * Finds the header row (if any) and what each column is. Files with column
 * names (Excel reports) are matched by name; files without them (attlog.dat)
 * by what's in the columns: the first number-like column is the scanner number,
 * and the time is the column that reads as a date and time.
 */
export function findLayout(cells: unknown[][]): Layout {
  const width = Math.max(0, ...cells.slice(0, 200).map(r => r.length))
  const sample = cells.slice(0, 300)
  const share = (c: number, test: (v: unknown) => boolean, from = 0) => {
    const filled = sample.slice(from).filter(r => text(r[c]))
    return filled.length ? filled.filter(r => test(r[c])).length / filled.length : 0
  }
  const full = (v: unknown) => !!(readWhen(v, "mdy")?.time || readWhen(v, "dmy")?.time)
  const dateOnly = (v: unknown) => !full(v) && !!(readWhen(v, "mdy") || readWhen(v, "dmy"))

  for (let i = 0; i < Math.min(cells.length, 20); i++) {
    const row = cells[i] ?? []
    const mapping: (ScanField | null)[] = Array.from({ length: width }, (_, c) => guessField(text(row[c])))
    // A column called "Date" or "Time" may hold the full date and time.
    for (let c = 0; c < width; c++) if ((mapping[c] === "date" || mapping[c] === "time") && share(c, full, i + 1) >= 0.8) mapping[c] = "datetime"
    const hasTime = mapping.includes("datetime") || mapping.includes("date")
    if (mapping.includes("code") && hasTime && !row.some(c => full(c) || dateOnly(c))) {
      // Each field once: keep the first column that claims it.
      const seen = new Set<ScanField>()
      const unique = mapping.map(f => {
        if (!f || seen.has(f)) return null
        seen.add(f)
        return f
      })
      // A full date-and-time column wins over separate date and time columns.
      if (unique.includes("datetime")) for (let c = 0; c < unique.length; c++) if (unique[c] === "date" || unique[c] === "time") unique[c] = null
      return { headerIndex: i, headers: Array.from({ length: width }, (_, c) => text(row[c])), mapping: unique }
    }
  }

  // No column names: judge each column by its values.
  const mapping: (ScanField | null)[] = Array(width).fill(null)
  const datetime = [...Array(width).keys()].find(c => share(c, full) >= 0.8)
  if (datetime !== undefined) mapping[datetime] = "datetime"
  else {
    const date = [...Array(width).keys()].find(c => share(c, dateOnly) >= 0.8)
    const time = [...Array(width).keys()].find(c => c !== date && share(c, v => !!readTime(v)) >= 0.8)
    if (date !== undefined) mapping[date] = "date"
    if (time !== undefined) mapping[time] = "time"
  }
  const code = [...Array(width).keys()].find(c => !mapping[c] && share(c, v => codeLike(v) && !full(v) && !dateOnly(v)) >= 0.8)
  if (code !== undefined) mapping[code] = "code"
  return { headerIndex: -1, headers: Array(width).fill(""), mapping }
}

// ---------------------------------------------------------------------------
// Rows → punches
// ---------------------------------------------------------------------------

/** Every row as a punch, with the business's time zone applied. Rows that can't be read are counted, not guessed. */
export function readPunches(cells: unknown[][], layout: Layout, order: DateOrder, firstLine = 1) {
  const col = (field: ScanField) => layout.mapping.indexOf(field)
  const [code, datetime, date, time, name] = (["code", "datetime", "date", "time", "name"] as ScanField[]).map(col)
  const punches: Punch[] = []
  const problems: number[] = []
  if (code < 0 || (datetime < 0 && date < 0)) return { punches, problems }

  for (let i = layout.headerIndex + 1; i < cells.length; i++) {
    const row = cells[i] ?? []
    if (!row.some(c => text(c))) continue
    const line = i + firstLine
    const raw = row[code]
    const id = typeof raw === "number" && Number.isInteger(raw) ? String(raw) : text(raw)
    let when: { day: Day; time: Hms | null } | null = null
    if (datetime >= 0) when = readWhen(row[datetime], order)
    else {
      const day = readWhen(row[date], order)
      const t = time >= 0 ? readTime(row[time]) : day?.time
      when = day && t ? { day: day.day, time: t } : null
    }
    if (!id || id.length > 40 || !when?.time) {
      problems.push(line)
      continue
    }
    const { y, m, d } = when.day
    const { h, mi, s } = when.time
    punches.push({ line, code: id, name: name >= 0 ? text(row[name]) || null : null, at: zonedToDate(y, m, d, h, mi, s) })
  }
  return { punches, problems }
}

export type PersonSummary = { code: string; key: string; name: string | null; count: number; first: Date; last: Date }

/** The punches grouped by person (scanner number), most punches first. */
export function people(punches: Punch[]): PersonSummary[] {
  const map = new Map<string, PersonSummary>()
  for (const p of punches) {
    const key = badgeKey(p.code)
    const s = map.get(key)
    if (!s) map.set(key, { code: p.code, key, name: p.name, count: 1, first: p.at, last: p.at })
    else {
      s.count++
      if (p.at < s.first) s.first = p.at
      if (p.at > s.last) s.last = p.at
      if (!s.name && p.name) s.name = p.name
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, undefined, { numeric: true }))
}

/** What the server gets: each scanner number with its punch times (unix seconds), duplicates removed. */
export function payload(punches: Punch[]): { code: string; times: number[] }[] {
  const map = new Map<string, Set<number>>()
  for (const p of punches) {
    const set = map.get(p.code) ?? new Set<number>()
    set.add(Math.floor(p.at.getTime() / 1000))
    map.set(p.code, set)
  }
  return [...map].map(([code, set]) => ({ code, times: [...set].sort((a, b) => a - b) }))
}
