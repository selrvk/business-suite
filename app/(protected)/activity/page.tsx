import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireAdminPage } from "@/lib/auth"
import { ActivityList, type ActivityRow } from "./activity-list"

export const metadata = { title: "Activity Log" }

export default async function ActivityPage() {
  const { supabase } = await requireAdminPage()
  const { data, error } = await supabase
    .from("activity_log")
    .select("id, username, action, target, details, created_at")
    .order("created_at", { ascending: false })
    .limit(1000)
  if (error) return <DbError error={error} />

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Activity Log"
        subtitle="Who changed prices, gave discounts, voided sales, corrected stock and more. Only owners and admins see this, and nobody can edit it."
      />
      <ActivityList rows={(data ?? []) as ActivityRow[]} />
    </>
  )
}
