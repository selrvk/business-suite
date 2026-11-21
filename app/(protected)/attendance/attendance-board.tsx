"use client"

import { useState } from "react"
import { LogIn, LogOut } from "lucide-react"
import { formatDuration, formatTime } from "@/lib/format"
import { clockEmployee } from "./actions"

export type BoardRow = {
  id: number
  name: string
  position: string | null
  openSince: string | null
  firstIn: string | null
  lastOut: string | null
  workedMs: number
}

/** Today's staff, grouped: in now, left for the day, not in yet. */
export function AttendanceBoard({ rows }: { rows: BoardRow[] }) {
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(id: number) {
    setBusyId(id)
    setError(null)
    const result = await clockEmployee(id)
    setBusyId(null)
    if (!result.ok) setError(result.error)
  }

  const groups = [
    { key: "in", label: "In now", rows: rows.filter(r => r.openSince) },
    { key: "left", label: "Left for the day", rows: rows.filter(r => !r.openSince && r.firstIn) },
    { key: "not", label: "Not in yet", rows: rows.filter(r => !r.firstIn) },
  ].filter(g => g.rows.length > 0)

  /** One line about their day, for phones. */
  const status = (r: BoardRow) =>
    r.openSince
      ? `In since ${formatTime(r.openSince)}`
      : r.lastOut
        ? `Out at ${formatTime(r.lastOut)}`
        : "Not in yet"

  const button = (r: BoardRow) => (
    <button
      type="button"
      className={`btn btn-sm ${r.openSince ? "btn-secondary" : "btn-good"}`}
      onClick={() => toggle(r.id)}
      disabled={busyId === r.id}
      title="For when someone forgot their badge"
    >
      {r.openSince ? <LogOut size={13} aria-hidden /> : <LogIn size={13} aria-hidden />}
      {busyId === r.id ? "Saving…" : r.openSince ? "Clock out" : "Clock in"}
    </button>
  )

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="alert alert-error">{error}</p>}

      {/* Table on wide screens */}
      <div className="table-wrap hidden lg:block">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>First in</th>
              <th>Last out</th>
              <th className="num">Hours today</th>
              <th>
                <span className="sr-only">Clock in or out</span>
              </th>
            </tr>
          </thead>
          {groups.map(g => (
            <tbody key={g.key}>
              <tr className="day-row">
                <th colSpan={5} scope="rowgroup">
                  {g.label}
                  <span className="faint font-normal"> · {g.rows.length}</span>
                </th>
              </tr>
              {g.rows.map(r => (
                <tr key={r.id}>
                  <td>
                    <p className="font-medium text-white">{r.name}</p>
                    {r.position && <p className="text-xs faint">{r.position}</p>}
                  </td>
                  <td className="muted tabular">{formatTime(r.firstIn)}</td>
                  <td className="muted tabular">{formatTime(r.lastOut)}</td>
                  <td className="num tabular">{r.workedMs ? <span className="text-white">{formatDuration(r.workedMs)}</span> : <span className="faint">—</span>}</td>
                  <td className="text-right">{button(r)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* List on phones and tablets */}
      <div className="lg:hidden flex flex-col gap-4">
        {groups.map(g => (
          <section key={g.key} className="card overflow-hidden" aria-label={g.label}>
            <header className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
              <h2 className="text-sm font-semibold text-white">{g.label}</h2>
              <span className="text-xs muted">{g.rows.length}</span>
            </header>
            <ul className="divide-y divide-white/5">
              {g.rows.map(r => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{r.name}</p>
                    <p className="text-xs faint truncate">
                      {status(r)}
                      {r.workedMs > 0 && ` · ${formatDuration(r.workedMs)} today`}
                    </p>
                  </div>
                  {button(r)}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-xs faint">Staff normally scan their badge at the time clock. These buttons are for when someone forgets theirs.</p>
    </div>
  )
}
