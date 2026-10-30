// Formatting and date helpers. All dates are shown and grouped in the business's
// time zone (config.timeZone), not the server's — servers usually run in UTC.

import { config } from "./config"

const tz = config.timeZone

const moneyFormat = new Intl.NumberFormat(config.locale, { style: "currency", currency: config.currency })

export function money(value: number | string | null | undefined) {
  return moneyFormat.format(Number(value ?? 0))
}

/** Prices for marketing and billing: "₱499" rather than "₱499.00" when there are no centavos. */
export function price(value: number) {
  return Number.isInteger(value)
    ? new Intl.NumberFormat(config.locale, { style: "currency", currency: config.currency, maximumFractionDigits: 0 }).format(value)
    : money(value)
}

export function num(value: number | string | null | undefined, maxDecimals = 0) {
  return Number(value ?? 0).toLocaleString(config.locale, { maximumFractionDigits: maxDecimals })
}

export function currencySymbol() {
  return moneyFormat.formatToParts(0).find(p => p.type === "currency")?.value ?? config.currency
}

type DateLike = string | number | Date | null | undefined

function make(options: Intl.DateTimeFormatOptions) {
  const fmt = new Intl.DateTimeFormat(config.locale, { timeZone: tz, ...options })
  return (value: DateLike, fallback = "—") => (value == null || value === "" ? fallback : fmt.format(new Date(value)))
}

export const formatDate = make({ month: "short", day: "numeric", year: "numeric" })
export const formatShortDate = make({ month: "short", day: "numeric" })
export const formatWeekday = make({ weekday: "short", month: "short", day: "numeric" })
export const formatLongDate = make({ weekday: "long", month: "long", day: "numeric", year: "numeric" })
export const formatTime = make({ hour: "numeric", minute: "2-digit" })
export const formatDateTime = make({ month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
export const formatShortDateTime = make({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
export const formatMonth = make({ month: "long", year: "numeric" })

export function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function hoursBetween(start: DateLike, end: DateLike = new Date()) {
  if (!start) return 0
  return Math.max(0, (new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 3600000)
}

// ---------------------------------------------------------------------------
// Calendar days in the business time zone. A "ymd" is a "2026-10-23" string.
// ---------------------------------------------------------------------------

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: tz,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

function zonedParts(date: Date) {
  const p: Record<string, number> = {}
  for (const part of partsFormat.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value)
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second }
}

function offsetMs(date: Date) {
  const p = zonedParts(date)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** Wall-clock time in the business time zone → the real instant. */
function zonedToDate(year: number, month: number, day: number, hour = 0, minute = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const first = guess - offsetMs(new Date(guess))
  return new Date(guess - offsetMs(new Date(first)))
}

const pad = (n: number) => String(n).padStart(2, "0")

export function isYmd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function toYmd(date: DateLike = new Date()) {
  const p = zonedParts(new Date(date ?? Date.now()))
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function addDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export function monthStart(ymd: string = toYmd()) {
  return `${ymd.slice(0, 7)}-01`
}

export function monthEnd(ymd: string = toYmd()) {
  const [y, m] = ymd.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${ymd.slice(0, 7)}-${pad(last)}`
}

/** Midnight at the start of that day, business time. */
export function startOfDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number)
  return zonedToDate(y, m, d)
}

/** [from 00:00, day after `toYmd` 00:00) as real instants, for database queries. */
export function dayRange(fromYmd: string, toYmd: string = fromYmd) {
  return { from: startOfDay(fromYmd), to: startOfDay(addDays(toYmd, 1)) }
}

/** Reads ?from=&to= search params, defaulting to the given range. */
export function readRange(params: { from?: string; to?: string }, defaults: { from: string; to: string }) {
  let from = isYmd(params.from) ? params.from : defaults.from
  let to = isYmd(params.to) ? params.to : defaults.to
  if (from > to) [from, to] = [to, from]
  return { from, to }
}

/** For <input type="datetime-local">, in business time. */
export function toDateTimeLocal(value: DateLike) {
  if (!value) return ""
  const p = zonedParts(new Date(value))
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

export function fromDateTimeLocal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) return null
  const [, y, mo, d, h, mi] = match.map(Number)
  return zonedToDate(y, mo, d, h, mi).toISOString()
}
