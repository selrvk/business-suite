import Link from "next/link"
import { addDays, monthEnd, monthStart, toYmd } from "@/lib/format"
import { CustomDates } from "./custom-dates"

type Preset = { label: string; from: string; to: string }

export function defaultPresets(today = toYmd()): Preset[] {
  const lastMonth = addDays(monthStart(today), -1)
  return [
    { label: "Today", from: today, to: today },
    { label: "7 days", from: addDays(today, -6), to: today },
    { label: "This month", from: monthStart(today), to: today },
    { label: "Last month", from: monthStart(lastMonth), to: monthEnd(lastMonth) },
  ]
}

/** Payroll cut-offs: 1st–15th and 16th–end of month. */
export function payrollPresets(today = toYmd()): Preset[] {
  const first = monthStart(today)
  const mid = `${today.slice(0, 7)}-15`
  const prevMonth = addDays(first, -1)
  const current = today <= mid ? { label: "1st–15th", from: first, to: mid } : { label: "16th–end", from: addDays(mid, 1), to: monthEnd(today) }
  const previous =
    today <= mid
      ? { label: "Previous cut-off", from: `${prevMonth.slice(0, 7)}-16`, to: prevMonth }
      : { label: "Previous cut-off", from: first, to: mid }
  return [{ label: "Today", from: today, to: today }, { label: "7 days", from: addDays(today, -6), to: today }, current, previous]
}

/** Date filter: quick presets plus a "Pick dates" button for any range. Works through the URL (?from=&to=). */
export function DateRange({
  path,
  from,
  to,
  extra = {},
  presets = defaultPresets(),
}: {
  path: string
  from: string
  to: string
  /** Other search params to keep when changing dates. */
  extra?: Record<string, string | undefined>
  presets?: Preset[]
}) {
  const keep = Object.entries(extra).filter((entry): entry is [string, string] => !!entry[1])
  const href = (f: string, t: string) => `${path}?${new URLSearchParams([...keep, ["from", f], ["to", t]])}`
  const custom = !presets.some(p => p.from === from && p.to === to)

  return (
    <div className="flex flex-wrap items-center gap-2 no-print">
      <div className="segmented">
        {presets.map(p => (
          <Link key={p.label} href={href(p.from, p.to)} data-active={p.from === from && p.to === to}>
            {p.label}
          </Link>
        ))}
      </div>
      <CustomDates path={path} from={from} to={to} keep={keep} active={custom} />
    </div>
  )
}
