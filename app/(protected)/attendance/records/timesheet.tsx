"use client"

import { useState } from "react"
import Link from "next/link"
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { ConfirmDialog, Modal } from "@/components/modal"
import { Empty } from "@/components/page-header"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { addDays, formatDuration, formatTime, formatWeekday, hoursBetween, toDateTimeLocal, toYmd } from "@/lib/format"
import type { AttendanceRecord, Employee } from "@/lib/types"
import { deleteAttendance, saveAttendance } from "../actions"

type SummaryRow = { id: number; name: string; days: number; hours: number; flagged: number }

export function Timesheet({
  summary,
  records,
  employees,
  isAdmin,
  period,
  today,
  range,
}: {
  summary: SummaryRow[]
  records: AttendanceRecord[]
  employees: Employee[]
  isAdmin: boolean
  period: string
  /** Today in the business's time zone (YYYY-MM-DD). */
  today: string
  range: { from: string; to: string }
}) {
  const [editing, setEditing] = useState<AttendanceRecord | "new" | null>(null)
  const [deleting, setDeleting] = useState<AttendanceRecord | null>(null)
  const [show, setShow] = useState<"all" | "fix">("all")
  const names = new Map(employees.map(e => [e.id, e.name]))
  const totalHours = summary.reduce((s, r) => s + r.hours, 0)

  // A shift with no clock-out, or one closed as "Missed clock-out", needs a look.
  const needsFix = (r: AttendanceRecord) => !r.clock_out || !!r.note?.includes("Missed clock-out")
  const fixCount = records.filter(needsFix).length
  const shown = show === "fix" ? records.filter(needsFix) : records
  const hours = (r: AttendanceRecord) => hoursBetween(r.clock_in, r.clock_out ?? undefined)

  // Punches grouped by day, newest first (they come sorted by clock-in, newest first).
  const days: { day: string; at: string; rows: AttendanceRecord[]; hours: number }[] = []
  for (const r of shown) {
    const day = toYmd(r.clock_in)
    let g = days[days.length - 1]
    if (!g || g.day !== day) days.push((g = { day, at: r.clock_in, rows: [], hours: 0 }))
    g.rows.push(r)
    g.hours += hours(r)
  }
  const dayLabel = (g: (typeof days)[number]) => {
    const special = g.day === today ? "Today" : g.day === addDays(today, -1) ? "Yesterday" : null
    return special ? `${special} · ${formatWeekday(g.at)}` : formatWeekday(g.at)
  }
  const employeeHref = (id: number) => `/attendance/records?${new URLSearchParams({ ...range, employee: String(id) })}`
  const out = (r: AttendanceRecord) =>
    r.clock_out ? (
      formatTime(r.clock_out)
    ) : toYmd(r.clock_in) === today ? (
      <span className="pill">Still in</span>
    ) : (
      <span className="pill" data-tone="warn">
        No clock-out
      </span>
    )

  const actions = (r: AttendanceRecord) =>
    isAdmin && (
      <div className="flex items-center justify-end gap-1 shrink-0">
        {needsFix(r) && toYmd(r.clock_in) !== today && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(r)}>
            Fix
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="btn btn-ghost btn-icon" aria-label={`Actions for ${names.get(r.employee_id) ?? "this punch"}, ${formatWeekday(r.clock_in)}`}>
              <MoreHorizontal size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(r)}>
              <Pencil /> Fix times
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(r)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="section-title">Summary · {period}</h2>
        {summary.length === 0 ? (
          <div className="table-wrap">
            <Empty title="No attendance in this period">
              Staff clock in at the Time Clock by scanning their badge. Using a fingerprint or face scanner? Import its file from the
              Attendance page.
            </Empty>
          </div>
        ) : (
          <>
            {/* Table on wide screens */}
            <div className="table-wrap hidden lg:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th className="num">Days present</th>
                    <th className="num">Total hours</th>
                    <th className="num">Avg / day</th>
                    <th>To check</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(s => (
                    <tr key={s.id}>
                      <td>
                        <Link href={employeeHref(s.id)} className="product-name">
                          {s.name}
                        </Link>
                      </td>
                      <td className="num">{s.days}</td>
                      <td className="num text-white font-semibold">{s.hours.toFixed(2)}</td>
                      <td className="num muted">{(s.hours / Math.max(1, s.days)).toFixed(1)}</td>
                      <td>
                        {s.flagged > 0 ? (
                          <span className="pill" data-tone="warn">
                            {s.flagged} open or missed
                          </span>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td />
                    <td className="num">{totalHours.toFixed(2)}</td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* List on phones and tablets */}
            <div className="lg:hidden card divide-y divide-white/5">
              {summary.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={employeeHref(s.id)} className="product-name block truncate">
                      {s.name}
                    </Link>
                    <p className="text-xs faint">
                      {s.days} {s.days === 1 ? "day" : "days"} · {(s.hours / Math.max(1, s.days)).toFixed(1)} h a day
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white font-semibold tabular">{s.hours.toFixed(2)} h</p>
                    {s.flagged > 0 && (
                      <span className="pill" data-tone="warn">
                        {s.flagged} to check
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-white" style={{ background: "var(--app-surface-2)" }}>
                <span>Total</span>
                <span className="tabular">{totalHours.toFixed(2)} h</span>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Punches</h2>
          <div className="flex flex-wrap items-center gap-2">
            {fixCount > 0 && (
              <div className="segmented" role="group" aria-label="Show">
                {(
                  [
                    ["all", "All", records.length],
                    ["fix", "To check", fixCount],
                  ] as const
                ).map(([key, label, n]) => (
                  <button key={key} type="button" data-active={show === key} aria-pressed={show === key} onClick={() => setShow(key)}>
                    {label}
                    <span className="seg-count" data-tone={key === "fix" ? "warn" : undefined}>
                      {n}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {isAdmin && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing("new")}>
                <Plus size={13} aria-hidden /> Add missed day
              </button>
            )}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="table-wrap">
            <p className="empty">No punches.</p>
          </div>
        ) : (
          <>
            {/* Table on wide screens, one section per day */}
            <div className="table-wrap hidden lg:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>In</th>
                    <th>Out</th>
                    <th className="num">Hours</th>
                    <th>Note</th>
                    {isAdmin && (
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                {days.map(g => (
                  <tbody key={g.day}>
                    <tr className="day-row">
                      <th colSpan={isAdmin ? 6 : 5} scope="rowgroup">
                        <span className="flex items-center justify-between gap-4">
                          <span>
                            {dayLabel(g)}
                            <span className="faint font-normal"> · {g.rows.length} {g.rows.length === 1 ? "punch" : "punches"}</span>
                          </span>
                          <span className="tabular">{formatDuration(g.hours * 3600000)}</span>
                        </span>
                      </th>
                    </tr>
                    {g.rows.map(r => (
                      <tr key={r.id}>
                        <td className="text-white">{names.get(r.employee_id) ?? "(deleted)"}</td>
                        <td className="tabular">{formatTime(r.clock_in)}</td>
                        <td className="tabular">{out(r)}</td>
                        <td className="num">{formatDuration(hours(r) * 3600000)}</td>
                        <td className={needsFix(r) && r.clock_out ? "text-warn" : "muted"}>{r.note ?? <span className="faint">—</span>}</td>
                        {isAdmin && <td className="whitespace-nowrap">{actions(r)}</td>}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>

            {/* List on phones and tablets */}
            <div className="lg:hidden flex flex-col gap-4">
              {days.map(g => (
                <section key={g.day} className="card overflow-hidden" aria-label={dayLabel(g)}>
                  <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
                    <h3 className="text-sm font-semibold text-white">{dayLabel(g)}</h3>
                    <span className="text-xs muted tabular">{formatDuration(g.hours * 3600000)}</span>
                  </header>
                  <ul className="divide-y divide-white/5">
                    {g.rows.map(r => (
                      <li key={r.id} className="flex items-center gap-3 pl-4 pr-1 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white truncate">{names.get(r.employee_id) ?? "(deleted)"}</p>
                          <p className="text-xs faint truncate">
                            {formatTime(r.clock_in)} – {r.clock_out ? formatTime(r.clock_out) : toYmd(r.clock_in) === today ? "still in" : "no clock-out"}
                            {r.note && <span className={needsFix(r) ? "text-warn" : ""}> · {r.note}</span>}
                          </p>
                        </div>
                        <span className="text-sm text-white tabular whitespace-nowrap">{formatDuration(hours(r) * 3600000)}</span>
                        {actions(r)}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </section>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add attendance" : "Fix attendance"} width={500}>
        {editing !== null && (
          <RecordForm
            key={editing === "new" ? "new" : editing.id}
            record={editing === "new" ? null : editing}
            employees={employees}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this punch?"
        message="The hours will no longer count toward this employee's total."
        confirmLabel="Delete"
        action={() => deleteAttendance(deleting!.id)}
      />
    </div>
  )
}

function RecordForm({ record, employees, onClose }: { record: AttendanceRecord | null; employees: Employee[]; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const missed = record?.note?.includes("Missed clock-out")

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    const result = await saveAttendance(record?.id ?? null, {
      employee_id: Number(form.get("employee_id")),
      clock_in: String(form.get("clock_in")),
      clock_out: String(form.get("clock_out")),
      note: String(form.get("note")),
    })
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onClose()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <p className="alert alert-error">{error}</p>}
      {missed && <p className="alert alert-warn">This shift was never clocked out. Enter the real clock-out time.</p>}
      <label>
        <span className="label">Employee</span>
        <select className="input" name="employee_id" defaultValue={record?.employee_id} required>
          {employees.map(e => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Clock in</span>
          <input className="input" type="datetime-local" name="clock_in" defaultValue={toDateTimeLocal(record?.clock_in)} required />
        </label>
        <label>
          <span className="label">Clock out</span>
          <input className="input" type="datetime-local" name="clock_out" defaultValue={missed ? "" : toDateTimeLocal(record?.clock_out)} />
        </label>
      </div>
      <label>
        <span className="label">Note</span>
        <input
          className="input"
          name="note"
          defaultValue={missed ? record?.note?.replace(/( · )?Missed clock-out/, "") : (record?.note ?? "")}
          placeholder="e.g. Forgot badge, approved by manager"
        />
      </label>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  )
}
