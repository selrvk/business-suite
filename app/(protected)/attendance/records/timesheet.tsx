"use client"

import { useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { ConfirmButton, Modal } from "@/components/modal"
import { Empty } from "@/components/page-header"
import { formatDuration, formatTime, formatWeekday, hoursBetween, toDateTimeLocal } from "@/lib/format"
import type { AttendanceRecord, Employee } from "@/lib/types"
import { deleteAttendance, saveAttendance } from "../actions"

type SummaryRow = { id: number; name: string; days: number; hours: number; flagged: number }

export function Timesheet({
  summary,
  records,
  employees,
  isAdmin,
  period,
}: {
  summary: SummaryRow[]
  records: AttendanceRecord[]
  employees: Employee[]
  isAdmin: boolean
  period: string
}) {
  const [editing, setEditing] = useState<AttendanceRecord | "new" | null>(null)
  const names = new Map(employees.map(e => [e.id, e.name]))
  const totalHours = summary.reduce((s, r) => s + r.hours, 0)

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="section-title">Summary · {period}</h2>
        <div className="table-wrap">
          {summary.length === 0 ? (
            <Empty title="No attendance in this period">
              Staff clock in at the Time Clock by scanning their badge. Using a fingerprint or face scanner? Import its file from the
              Attendance page.
            </Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="num">Days present</th>
                  <th className="num">Total hours</th>
                  <th className="num">Avg / day</th>
                  <th>Needs review</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(s => (
                  <tr key={s.id}>
                    <td className="font-medium text-white">{s.name}</td>
                    <td className="num">{s.days}</td>
                    <td className="num text-white font-semibold">{s.hours.toFixed(2)}</td>
                    <td className="num muted">{(s.hours / Math.max(1, s.days)).toFixed(1)}</td>
                    <td>{s.flagged > 0 ? <span className="pill" data-tone="warn">{s.flagged} open / missed</span> : <span className="faint">—</span>}</td>
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
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Punches</h2>
          {isAdmin && (
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing("new")}>
              <Plus size={13} /> Add missed day
            </button>
          )}
        </div>
        <div className="table-wrap">
          {records.length === 0 ? (
            <p className="empty">No punches.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>In</th>
                  <th>Out</th>
                  <th className="num">Hours</th>
                  <th>Note</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {records.map(r => {
                  const flagged = !r.clock_out || r.note?.includes("Missed clock-out")
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap muted">{formatWeekday(r.clock_in)}</td>
                      <td className="text-white">{names.get(r.employee_id) ?? "(deleted)"}</td>
                      <td>{formatTime(r.clock_in)}</td>
                      <td>{r.clock_out ? formatTime(r.clock_out) : <span className="pill" data-tone="good">Still in</span>}</td>
                      <td className="num">{formatDuration(hoursBetween(r.clock_in, r.clock_out ?? undefined) * 3600000)}</td>
                      <td className={flagged ? "text-warn" : "muted"}>{r.note ?? "—"}</td>
                      {isAdmin && (
                        <td className="text-right whitespace-nowrap">
                          <button className="btn btn-ghost btn-icon" onClick={() => setEditing(r)} title="Fix times">
                            <Pencil size={14} />
                          </button>
                          <ConfirmButton
                            className="btn btn-ghost btn-icon"
                            title="Delete this punch?"
                            message="The hours will no longer count toward this employee's total."
                            confirmLabel="Delete"
                            action={() => deleteAttendance(r.id)}
                          >
                            <Trash2 size={14} />
                          </ConfirmButton>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
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
