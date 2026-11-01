import { DbError } from "@/components/db-error"
import { DateRange, payrollPresets } from "@/components/date-range"
import { ExportButton } from "@/components/export-button"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { dayRange, formatDate, formatTime, hoursBetween, monthStart, readRange, startOfDay, toYmd } from "@/lib/format"
import type { AttendanceRecord, Employee } from "@/lib/types"
import { Timesheet } from "./timesheet"

export const metadata = { title: "Timesheets" }

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; employee?: string }>
}) {
  await requireModule("attendance")
  const params = await searchParams
  const supabase = await getSupabase()
  const today = toYmd()
  const { from, to } = readRange(params, { from: monthStart(today), to: today })
  const range = dayRange(from, to)
  const employeeId = Number(params.employee) || null

  let query = supabase
    .from("attendance")
    .select("id, employee_id, clock_in, clock_out, note")
    .gte("clock_in", range.from.toISOString())
    .lt("clock_in", range.to.toISOString())
    .order("clock_in", { ascending: false })
    .limit(5000)
  if (employeeId) query = query.eq("employee_id", employeeId)

  const [{ isAdmin }, recordsResult, employeesResult] = await Promise.all([
    requireUser(),
    query,
    supabase.from("employees").select("id, name, code, position, phone, active").order("name"),
  ])
  if (recordsResult.error) return <DbError error={recordsResult.error} />
  if (employeesResult.error) return <DbError error={employeesResult.error} />

  const records = recordsResult.data as AttendanceRecord[]
  const employees = employeesResult.data as Employee[]
  const names = new Map(employees.map(e => [e.id, e.name]))

  // Per-employee totals. A still-open shift counts up to now.
  const totals = new Map<number, { days: Set<string>; hours: number; flagged: number }>()
  for (const r of records) {
    const t = totals.get(r.employee_id) ?? { days: new Set(), hours: 0, flagged: 0 }
    t.days.add(toYmd(r.clock_in))
    t.hours += hoursBetween(r.clock_in, r.clock_out ?? undefined)
    if (r.note?.includes("Missed clock-out") || !r.clock_out) t.flagged++
    totals.set(r.employee_id, t)
  }
  const summary = [...totals]
    .map(([id, t]) => ({ id, name: names.get(id) ?? "(deleted)", days: t.days.size, hours: t.hours, flagged: t.flagged }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const detailRows = records.map(r => ({
    Date: formatDate(r.clock_in),
    Employee: names.get(r.employee_id) ?? "",
    In: formatTime(r.clock_in),
    Out: r.clock_out ? formatTime(r.clock_out) : "",
    Hours: +hoursBetween(r.clock_in, r.clock_out ?? undefined).toFixed(2),
    Note: r.note ?? (r.clock_out ? "" : "Still clocked in"),
  }))
  const summaryRows = summary.map(s => ({ Employee: s.name, "Days present": s.days, "Total hours": +s.hours.toFixed(2) }))

  return (
    <>
      <PageHeader eyebrow="People" title="Timesheets" subtitle="Hours worked per employee, ready for payroll. Admins can fix missed or wrong punches.">
        <ExportButton rows={summaryRows} filename={`timesheet_summary_${from}_to_${to}`} sheet="Summary" label="Export summary" />
        <ExportButton rows={detailRows} filename={`timesheet_detail_${from}_to_${to}`} sheet="Punches" label="Export all punches" />
      </PageHeader>

      <div className="flex flex-col gap-3 mb-6">
        <DateRange
          path="/attendance/records"
          from={from}
          to={to}
          presets={payrollPresets(today)}
          extra={{ employee: employeeId ? String(employeeId) : undefined }}
        />
        <form className="flex items-end gap-2" action="/attendance/records">
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <label>
            <span className="label">Employee</span>
            <select className="input min-w-56" name="employee" defaultValue={employeeId ?? ""}>
              <option value="">Everyone</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary" type="submit">
            Show
          </button>
        </form>
      </div>

      <Timesheet
        summary={summary}
        records={records}
        employees={employees.filter(e => e.active || totals.has(e.id))}
        isAdmin={isAdmin}
        period={from === to ? formatDate(startOfDay(from)) : `${formatDate(startOfDay(from))} – ${formatDate(startOfDay(to))}`}
      />
    </>
  )
}
