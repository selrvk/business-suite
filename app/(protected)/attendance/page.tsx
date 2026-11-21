import Link from "next/link"
import { FileClock, Timer, Users } from "lucide-react"
import { DbError } from "@/components/db-error"
import { Empty, PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { formatLongDate, startOfDay, toYmd } from "@/lib/format"
import type { AttendanceRecord, Employee } from "@/lib/types"
import { AttendanceBoard, type BoardRow } from "./attendance-board"
import { AttendanceSummary } from "./attendance-summary"

export const metadata = { title: "Attendance" }

export default async function AttendancePage() {
  await requireModule("attendance")
  const supabase = await getSupabase()
  const today = toYmd()
  const dayStartDate = startOfDay(today)
  const dayStart = dayStartDate.toISOString()

  const [{ isAdmin }, employeesResult, recordsResult] = await Promise.all([
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
      <PageHeader title="Attendance" subtitle={formatLongDate(new Date())}>
        {isAdmin && (
          <Link href="/attendance/import" className="btn btn-secondary">
            <FileClock size={14} aria-hidden /> Import from scanner
          </Link>
        )}
        <Link href="/time-clock" className="btn btn-primary">
          <Timer size={15} aria-hidden /> Open time clock
        </Link>
      </PageHeader>

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
        <>
          <AttendanceSummary inNow={inNow} cameIn={cameIn} staff={employees.length} workedMs={totalMs} />
          <AttendanceBoard rows={rows} />
        </>
      )}
    </>
  )
}
