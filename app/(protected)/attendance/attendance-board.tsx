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

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="alert alert-error">{error}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Status</th>
              <th>First in</th>
              <th>Last out</th>
              <th className="num">Today</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>
                  <p className="font-medium text-white">{r.name}</p>
                  {r.position && <p className="text-xs faint">{r.position}</p>}
                </td>
                <td>
                  {r.openSince ? (
                    <span className="pill" data-tone="good">
                      In since {formatTime(r.openSince)}
                    </span>
                  ) : r.firstIn ? (
                    <span className="pill" data-tone="info">
                      Out
                    </span>
                  ) : (
                    <span className="pill">Not in</span>
                  )}
                </td>
                <td className="muted">{formatTime(r.firstIn)}</td>
                <td className="muted">{formatTime(r.lastOut)}</td>
                <td className="num text-white">{r.workedMs ? formatDuration(r.workedMs) : "—"}</td>
                <td className="text-right">
                  <button
                    className={`btn btn-sm ${r.openSince ? "btn-secondary" : "btn-good"}`}
                    onClick={() => toggle(r.id)}
                    disabled={busyId === r.id}
                    title="For when someone forgot their badge"
                  >
                    {r.openSince ? <LogOut size={13} /> : <LogIn size={13} />}
                    {r.openSince ? "Clock out" : "Clock in"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs faint">
        Staff normally scan their badge at the time clock. These buttons are for when someone forgets theirs.
      </p>
    </div>
  )
}
