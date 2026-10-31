import { notFound, redirect } from "next/navigation"
import { AuthCard } from "@/components/auth-card"
import { getClaims, isPlatformEmail } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { SignOutButton } from "../../sign-in-form"
import { TwoStepForm } from "./two-step-form"

export const metadata = { title: "Two-step login" }

/** The platform owner's second login step (set up an authenticator app, or enter its code). */
export default async function TwoStepPage() {
  const claims = await getClaims()
  if (!claims || !isPlatformEmail(claims.email)) notFound()
  if (claims.twoStep) redirect("/platform")

  const { data } = await (await getSupabase()).auth.mfa.listFactors()
  const hasApp = (data?.totp.length ?? 0) > 0

  return (
    <AuthCard title={hasApp ? "Two-step login" : "Set up two-step login"} subtitle={claims.email}>
      <div className="flex flex-col gap-4">
        <TwoStepForm hasApp={hasApp} />
        <SignOutButton className="btn btn-ghost btn-block" />
      </div>
    </AuthCard>
  )
}
