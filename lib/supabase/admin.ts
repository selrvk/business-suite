import { createClient } from "@supabase/supabase-js"

/**
 * Service-role client: bypasses all permissions. Server-only, and only after
 * checking the caller is allowed (see lib/auth.ts). Never import from a client component.
 */
export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set")
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
