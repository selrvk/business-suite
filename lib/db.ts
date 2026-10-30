import type { PostgrestError } from "@supabase/supabase-js"

type DbError = { message: string; code?: string } | null | undefined

const FRIENDLY: Record<string, string> = {
  items_business_id_barcode_key: "Another product already uses this barcode.",
  employees_business_id_code_key: "Another employee already has this badge code.",
  vehicles_business_id_code_key: "Another vehicle already has this tag code.",
  members_business_id_username_key: "That username is already taken.",
  businesses_slug_key: "That staff link is already taken. Try another.",
  trips_one_open_per_vehicle: "This vehicle already has a trip in progress.",
  attendance_one_open_shift: "This employee is already clocked in.",
  trips_end_after_start: "The ending odometer can't be lower than the starting one.",
  attendance_out_after_in: "Clock-out can't be earlier than clock-in.",
}

export const SETUP_MESSAGE = "The database isn't set up yet. Run supabase/schema.sql in the Supabase SQL editor of a new project."

/** True when a table/function from supabase/schema.sql is missing. */
export function isMissingSchema(error: DbError) {
  return !!error && ["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "")
}

/** Turns a database error into a sentence a shop owner can act on. */
export function dbMessage(error: DbError, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback
  if (isMissingSchema(error)) return SETUP_MESSAGE
  for (const [constraint, message] of Object.entries(FRIENDLY)) {
    if (error.message?.includes(constraint)) return message
  }
  if (error.code === "42501") return "You don't have permission to do that. Ask an admin."
  if (error.code === "23503") return "That record no longer exists. Refresh the page and try again."
  if (error.code === "P0001") return error.message // our own `raise exception` messages
  return error.message || fallback
}

/**
 * Supabase returns at most 1000 rows per request. This pages through all of them.
 * The query must have a stable `.order()`.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const size = 1000
  const rows: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) return { data: rows, error }
    rows.push(...(data ?? []))
    if (!data || data.length < size) return { data: rows, error: null }
  }
}
