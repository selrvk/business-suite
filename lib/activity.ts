import "server-only"
import type { Session } from "./auth"

/**
 * Records who did what, for owners and admins to read on the Activity Log.
 * The database fills in who did it; a failure here never stops the action.
 *   action: "price_changed", "sale_voided", ... (see ACTIVITY_LABELS in lib/activity-labels.ts)
 *   target: what it was about, e.g. a product name or "Sale #42"
 *   details: anything useful, e.g. { from: 60, to: 65 }
 */
export async function logActivity(session: Pick<Session, "supabase">, action: string, target: string | null, details: Record<string, unknown> = {}) {
  const { error } = await session.supabase.from("activity_log").insert({ action, target, details })
  if (error) console.error(`Activity not logged (${action}): ${error.message}`)
}
