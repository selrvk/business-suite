"use server"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

const WRONG = { ok: false as const, error: "Wrong username or password." }

/**
 * Staff log in with the username their owner gave them. The login's email is
 * looked up on the server (it never reaches the browser), so it works for any
 * login, including ones carried over from older versions.
 */
export async function staffSignIn(slug: string, login: string, password: string): Promise<ActionResult> {
  const id = login.trim().toLowerCase()
  if (!id || !password) return WRONG
  let email = id

  if (!id.includes("@")) {
    const admin = createSupabaseAdminClient()
    const { data: business } = await admin.from("businesses").select("id").eq("slug", slug).maybeSingle()
    if (!business) return WRONG
    const { data: member } = await admin.from("members").select("user_id").eq("business_id", business.id).eq("username", id).maybeSingle()
    if (!member) return WRONG
    const { data } = await admin.auth.admin.getUserById(member.user_id)
    if (!data.user?.email) return WRONG
    email = data.user.email
  }

  const { error } = await (await createSupabaseServerClient()).auth.signInWithPassword({ email, password })
  return error ? WRONG : { ok: true, data: null }
}
