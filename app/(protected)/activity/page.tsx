import { DbError } from "@/components/db-error"
import { requireAdminPage } from "@/lib/auth"
import { toYmd } from "@/lib/format"
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

  return <ActivityList rows={(data ?? []) as ActivityRow[]} today={toYmd()} />
}
