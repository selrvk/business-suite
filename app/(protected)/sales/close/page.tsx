import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { dayRange, isYmd, toYmd } from "@/lib/format"
import type { DaySummary } from "@/lib/notify"
import { CloseDay, type Closing } from "./close-day"

export const metadata = { title: "End of Day" }

export default async function CloseDayPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  await requireModule("sales")
  const { day: asked } = await searchParams
  const today = toYmd()
  const day = isYmd(asked) && asked <= today ? asked : today
  const range = dayRange(day)
  const { supabase } = await requireUser()
  const [summary, closing, recent] = await Promise.all([
    supabase.rpc("day_summary", { p_from: range.from.toISOString(), p_to: range.to.toISOString() }),
    supabase.from("day_closings").select("day, opening_cash, expected_cash, counted_cash, difference, note, username, updated_at").eq("day", day).maybeSingle(),
    supabase.from("day_closings").select("day, opening_cash, expected_cash, counted_cash, difference, note, username, updated_at").order("day", { ascending: false }).limit(14),
  ])
  const error = summary.error ?? closing.error ?? recent.error
  if (error) return <DbError error={error} />

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="End of Day"
        subtitle="The day's sales and payments, and a count of the cash drawer. Close the day before going home."
      />
      <CloseDay
        day={day}
        today={today}
        summary={summary.data as DaySummary}
        closing={(closing.data as Closing | null) ?? null}
        recent={(recent.data ?? []) as Closing[]}
      />
    </>
  )
}
