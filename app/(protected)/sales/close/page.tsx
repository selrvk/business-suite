import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { PrintButton } from "@/components/print-button"
import { requireModule, requireUser } from "@/lib/auth"
import { dayRange, isYmd, toYmd } from "@/lib/format"
import type { DaySummary } from "@/lib/notify"
import Link from "next/link"
import { Warehouse } from "lucide-react"
import { getWorkplace } from "@/lib/locations"
import { CloseDay, type Closing } from "./close-day"

export const metadata = { title: "End of Day" }

export default async function CloseDayPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  await requireModule("sales")
  const { day: asked } = await searchParams
  const today = toYmd()
  const day = isYmd(asked) && asked <= today ? asked : today
  const range = dayRange(day)
  const session = await requireUser()
  const { supabase } = session
  const workplace = await getWorkplace(session)
  const { here, multi } = workplace

  if (multi && here.kind === "warehouse")
    return (
      <>
        <PageHeader title="End of Day" />
        <div className="card card-body flex flex-col items-start gap-3 max-w-xl">
          <Warehouse size={22} className="text-brand" aria-hidden />
          <p className="text-white font-semibold">{here.name} is a warehouse, so there&apos;s no cash drawer to close</p>
          <p className="text-sm muted">
            {workplace.canSwitch
              ? `Each branch closes its own day. Switch to a branch with "Working at" in the menu.`
              : "Each branch closes its own day. Ask an owner or admin to set you up at a branch."}
          </p>
          <Link href="/sales" className="btn btn-secondary">
            See sales history
          </Link>
        </div>
      </>
    )

  // Each location closes its own day (a business with one location: the main one).
  const closings = () => {
    const query = supabase.from("day_closings").select("day, opening_cash, expected_cash, counted_cash, difference, note, username, updated_at")
    return here.id ? query.eq("location_id", here.id) : query
  }
  const [summary, closing, recent] = await Promise.all([
    supabase.rpc("day_summary", { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_location_id: multi ? here.id : null }),
    closings().eq("day", day).maybeSingle(),
    closings().order("day", { ascending: false }).limit(14),
  ])
  const error = summary.error ?? closing.error ?? recent.error
  if (error) return <DbError error={error} />

  return (
    <>
      <PageHeader
        title="End of Day"
        subtitle={`The day's sales and payments${multi ? ` at ${here.name}` : ""}, and a count of the cash drawer. Close the day before going home.`}
      >
        <PrintButton className="btn btn-secondary" />
      </PageHeader>
      <CloseDay
        day={day}
        today={today}
        summary={summary.data as DaySummary}
        closing={(closing.data as Closing | null) ?? null}
        recent={(recent.data ?? []) as Closing[]}
        locationId={multi ? here.id : null}
      />
    </>
  )
}
