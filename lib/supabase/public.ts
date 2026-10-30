import { createClient } from "@supabase/supabase-js"

/** Cookie-less client for public data (business settings), safe to cache across requests. */
export function createSupabasePublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
