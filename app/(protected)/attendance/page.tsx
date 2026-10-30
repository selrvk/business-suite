import Link from "next/link"
import { Sheet, Timer, Users } from "lucide-react"
import { DbError } from "@/components/db-error"
import { Empty, PageHeader, Stat } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { formatDuration, formatLongDate, startOfDay, toYmd } from "@/lib/format"
import type { AttendanceRecord, Employee } from "@/lib/types"
import { AttendanceBoard, type BoardRow } from "./attendance-board"

export const metadata = { title: "Attendance" }

export default async function AttendancePage() {
  requireModule("attendance")
  const supabase = await getSupabase()
  const today = toYmd()
  const dayStartDate = startOfDay(today)
  const dayStart = dayStartDate.toISOString()

  const [, employeesResult, recordsResult] = await Promise.all([
    requireUser(),
    supabase.from("employees").select("id, name, code, position, phone, active").eq("active", true).order("name"),
    supabase
      .from("attendance")
      .select("id, employee_id, clock_in, clock_out, note")
      .or(`clock_in.gte."${dayStart}",clock_out.is.null`)
      .order("clock_in"),
  ])
  if (employeesResult.error) return <DbError error={employeesResult.error} />
  if (recordsResult.error) return <DbError error={recordsResult.error} />

  const employees = employeesResult.data as Employee[]
  const records = recordsResult.data as AttendanceRecord[]
  const now = new Date().getTime()

  const rows: BoardRow[] = employees.map(e => {
    const own = records.filter(r => r.employee_id === e.id)
    const open = own.find(r => !r.clock_out) ?? null
    const todays = own.filter(r => new Date(r.clock_in) >= dayStartDate)
    const workedMs = todays.reduce((sum, r) => sum + ((r.clock_out ? new Date(r.clock_out).getTime() : now) - new Date(r.clock_in).getTime()), 0)
    return {
      id: e.id,
      name: e.name,
      position: e.position,
      openSince: open?.clock_in ?? null,
      firstIn: todays[0]?.clock_in ?? null,
      lastOut: [...todays].reverse().find(r => r.clock_out)?.clock_out ?? null,
      workedMs,
    }
  })

  const inNow = rows.filter(r => r.openSince).length
  const cameIn = rows.filter(r => r.firstIn).length
  const totalMs = rows.reduce((s, r) => s + r.workedMs, 0)

  return (
    <>
      <PageHeader eyebrow="People" title="Attendance" subtitle={formatLongDate(new Date())}>
        <Link href="/attendance/records" className="btn btn-secondary">
          <Sheet size={14} /> Timesheets
        </Link>
        <Link href="/time-clock" className="btn btn-primary">
          <Timer size={15} /> Open time clock
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Stat label="Clocked in now" value={inNow} tone="good" />
        <Stat label="Came in today" value={`${cameIn} / ${employees.length}`} tone="brand" />
        <Stat label="Not in yet" value={employees.length - cameIn} tone={employees.length - cameIn ? "warn" : undefined} />
        <Stat label="Hours today" value={formatDuration(totalMs)} tone="info" hint="All staff combined" />
      </div>

      {employees.length === 0 ? (
        <div className="card">
          <Empty title="No employees yet" icon={<Users size={30} />}>
            <Link href="/employees" className="underline">
              Add your staff
            </Link>{" "}
            and print their badges to start.
          </Empty>
        </div>
      ) : (
        <AttendanceBoard rows={rows} />
      )}
    </>
  )
}
