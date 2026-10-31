import Link from "next/link"
import { AuthCard } from "@/components/auth-card"
import { ForgotPasswordForm } from "./forgot-password-form"

export const metadata = { title: "Forgot password" }

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter the email you log in with and we'll send you a link to choose a new one."
      footer={
        <>
          <Link href="/login" className="text-white underline decoration-dotted">
            Back to log in
          </Link>
          <br />
          <span className="text-xs faint">Staff: ask your business owner to reset your password.</span>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  )
}
