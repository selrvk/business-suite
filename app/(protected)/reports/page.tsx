import { DbError } from "@/components/db-error"
import { requireModule, requirePermission } from "@/lib/auth"
import { config } from "@/lib/config"
import { hasOption } from "@/lib/features"
import { dayRange, monthStart, readRange, toYmd } from "@/lib/format"
import { readProfitReport } from "@/lib/reports"
import { getWorkplace, placeFilter, viewLocation } from "@/lib/locations"
import { ReportView, SLOW_DAYS } from "./report-view"

export const metadata = { title: "Profit Report" }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; slow?: string; at?: string }> }) {
  await requireModule("sales")
  const session = await requirePermission("see_costs")
  const { supabase, business } = session
  const params = await searchParams
  const workplace = await getWorkplace(session)
  const view = viewLocation(workplace, params.at)
  const today = toYmd()
  const { from, to } = readRange(params, { from: monthStart(today), to: today })
  const range = dayRange(from, to)
  const slow = SLOW_DAYS.find(d => String(d) === params.slow) ?? 60

  const { data, error } = await supabase.rpc("profit_report", {
    p_from: range.from.toISOString(),
    p_to: range.to.toISOString(),
    p_tz: config.timeZone,
    p_slow_days: slow,
    p_business_id: null,
    p_location_id: view?.id ?? null,
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
      place={placeFilter(workplace, view)}
    />
  )
}
