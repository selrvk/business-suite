import Link from "next/link"
import { redirect } from "next/navigation"
import { AuthCard } from "@/components/auth-card"
import { getClaims, getSession, isPlatformAdmin } from "@/lib/auth"
import { config } from "@/lib/config"
import { SETUP_MESSAGE, isMissingSchema } from "@/lib/db"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { SignInForm, SignOutButton } from "../sign-in-form"
import { FinishSetupForm } from "./finish-setup-form"

export const metadata = { title: "Log in" }

/** True when the connected database hasn't had supabase/schema.sql run on it. */
async function schemaMissing() {
  // A normal (not head-only) query, so a missing table comes back with its error code.
  const { error } = await createSupabaseAdminClient().from("members").select("user_id").limit(1)
  return isMissingSchema(error)
}

export default async function LoginPage() {
  const [session, claims] = await Promise.all([getSession(), getClaims()])
  if (session) redirect("/dashboard")

  // Signed in, but the login has no business.
  if (claims) {
    const [platform, missing] = await Promise.all([isPlatformAdmin(), schemaMissing()])
    if (platform && !missing) redirect("/platform") // the platform owner has no business, by design
    const staff = claims.email.endsWith(`.${config.staffEmailDomain}`)
    return (
      <AuthCard title={missing ? "Database not set up" : "One more step"} subtitle={claims.email}>
        <div className="flex flex-col gap-4">
          {missing ? (
            <p className="alert alert-warn">
              {SETUP_MESSAGE} If you&apos;re seeing this locally, your .env probably points at an older database.
            </p>
          ) : staff ? (
            <p className="text-sm muted">This staff login isn&apos;t part of a business anymore. Ask the owner to add you again.</p>
          ) : (
            <>
              <p className="text-sm muted">This login doesn&apos;t have a business yet. Name it to finish setting up; your free trial starts now.</p>
              <FinishSetupForm />
            </>
          )}
          {platform && (
            <Link href="/platform" className="btn btn-secondary btn-block">
              Go to platform admin
            </Link>
          )}
          <SignOutButton className="btn btn-ghost btn-block" />
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Your email, or your username with your business's link (username@your-business)"
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="text-white underline decoration-dotted">
            Start a free trial
          </Link>
          <br />
          <span className="text-xs faint">Staff can also use their business&apos;s staff link, with just their username.</span>
        </>
      }
    >
      <SignInForm mode="email" />
    </AuthCard>
  )
}
