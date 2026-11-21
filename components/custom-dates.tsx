"use client"

import { useState } from "react"
import { CalendarDays } from "lucide-react"
import { formatShortDate } from "@/lib/format"

/**
 * The "Pick dates" button next to the date presets. It opens a from/to form;
 * when a custom range is showing, the button names it ("Nov 3 – Nov 18").
 */
export function CustomDates({
  path,
  from,
  to,
  keep,
  active,
}: {
  path: string
  from: string
  to: string
  /** Other search params to keep when applying. */
  keep: [string, string][]
  /** The range showing isn't one of the presets. */
  active: boolean
}) {
  const [open, setOpen] = useState(false)
  const label = from === to ? formatShortDate(from) : `${formatShortDate(from)} – ${formatShortDate(to)}`

  return (
    <>
      <div className="segmented">
        <button type="button" className="inline-flex items-center gap-1.5" data-active={active} aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <CalendarDays size={13} aria-hidden />
          {active ? label : "Pick dates"}
        </button>
      </div>
      {open && (
        <form className="basis-full flex flex-wrap items-end gap-2" action={path}>
          {keep.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label className="max-sm:flex-1 max-sm:min-w-0">
            <span className="label">From</span>
            <input className="input" type="date" name="from" defaultValue={from} />
          </label>
          <label className="max-sm:flex-1 max-sm:min-w-0">
            <span className="label">To</span>
            <input className="input" type="date" name="to" defaultValue={to} />
          </label>
          <button className="btn btn-secondary" type="submit">
            Apply
          </button>
        </form>
      )}
    </>
  )
}
