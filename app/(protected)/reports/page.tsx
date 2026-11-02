import { DbError } from "@/components/db-error"
import { requireModule, requirePermission } from "@/lib/auth"
import { config } from "@/lib/config"
import { hasOption } from "@/lib/features"
import { dayRange, monthStart, readRange, toYmd } from "@/lib/format"
import { readProfitReport } from "@/lib/reports"
import { ReportView, SLOW_DAYS } from "./report-view"

export const metadata = { title: "Profit Report" }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; slow?: string }> }) {
  await requireModule("sales")
  const { supabase, business } = await requirePermission("see_costs")
  const params = await searchParams
  const today = toYmd()
  const { from, to } = readRange(params, { from: monthStart(today), to: today })
  const range = dayRange(from, to)
  const slow = SLOW_DAYS.find(d => String(d) === params.slow) ?? 60

  const { data, error } = await supabase.rpc("profit_report", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_tz: config.timeZone,
    p_slow_days: slow,
  })
  if (error) return <DbError error={error} />

  return (
    <ReportView
      report={readProfitReport(data)}
      from={from}
      to={to}
      today={today}
      slow={slow}
      slowParam={params.slow}
      categories={hasOption(business, "categories")}
    />
  )
}
