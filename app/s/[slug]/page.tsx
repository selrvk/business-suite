import { notFound, redirect } from "next/navigation"
import { AuthCard } from "@/components/auth-card"
import { getSession } from "@/lib/auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { SignInForm } from "../../sign-in-form"

export const metadata = { title: "Staff log in" }

/** A business's own login page for staff (username + password). Bookmark it on the shop computer. */
export default async function StaffLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) notFound()

  const [session, { data: business }] = await Promise.all([
    getSession(),
    createSupabaseAdminClient().from("businesses").select("name, slug, logo_url").eq("slug", slug).maybeSingle(),
  ])
  if (!business) notFound()
  if (session?.business.slug === slug) redirect("/dashboard")

  return (
    <AuthCard title={business.name} subtitle="Staff log in" brandName={business.name} logoUrl={business.logo_url}>
      <SignInForm mode="username" businessSlug={business.slug} />
    </AuthCard>
  )
}
