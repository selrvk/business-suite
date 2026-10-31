import Link from "next/link"
import { AuthCard } from "@/components/auth-card"
import { getClaims, linkLoginIsFresh } from "@/lib/auth"
import { NewPasswordForm } from "./new-password-form"

export const metadata = { title: "Choose a new password" }

export default async function ResetPasswordPage() {
  const claims = await getClaims()
  const fresh = claims && linkLoginIsFresh(claims.linkLoginAt)

  return (
    <AuthCard title="Choose a new password" subtitle={claims?.email}>
      {fresh ? (
        <NewPasswordForm />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="alert alert-warn">This page only works right after opening a reset link from your email.</p>
          <Link href="/forgot-password" className="btn btn-primary btn-block">
            Send me a new link
          </Link>
        </div>
      )}
    </AuthCard>
  )
}
